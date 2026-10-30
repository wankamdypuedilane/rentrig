-- RentRig payments with Stripe (chapter 18).
-- Stripe is the source of truth for money; these tables record what our server
-- has seen. Every transition below is idempotent: Stripe may deliver an event
-- twice, and our own server may retry a call that already succeeded.

-- 1. Customers -------------------------------------------------------------

-- The Stripe customer of each profile, written by server code only (the column
-- grant of chapter 10 lets users update full_name and company_name, nothing else).
alter table public.profiles
  add column stripe_customer_id text unique check (stripe_customer_id ~ '^cus_[A-Za-z0-9]+$');

-- Sign-up now also asks for an optional company name.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, company_name)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 100),
    nullif(left(coalesce(new.raw_user_meta_data ->> 'company_name', ''), 120), '')
  );
  return new;
end;
$$;

-- 2. Reservations: checkout hold, payment, refund and deposit ---------------

create type public.deposit_status as enum ('not_held', 'held', 'released', 'captured');

alter table public.reservations
  -- A pending reservation holds the item only until this time. The default is a
  -- safety net for rows created without an explicit hold: one hour, never forever.
  add column hold_expires_at timestamptz default now() + interval '1 hour',
  add column checkout_session_id text unique,
  add column payment_intent_id text unique,
  add column paid_at timestamptz,
  -- What we have promised to refund and not refunded yet.
  add column refund_due_cents integer not null default 0 check (refund_due_cents >= 0),
  add column deposit_status public.deposit_status not null default 'not_held',
  add column deposit_payment_intent_id text unique,
  add constraint pending_reservations_expire
    check (status <> 'pending_payment' or hold_expires_at is not null);

-- Expired holds no longer make an item look busy in the catalogue.
create or replace function public.equipment_busy_dates(item uuid, from_date date, to_date date)
returns table (starts_on date, ends_on date)
language sql
stable
security definer
set search_path = ''
as $$
  select r.starts_on, r.ends_on
  from public.reservations r
  where r.equipment_id = item
    and (r.status = 'confirmed' or (r.status = 'pending_payment' and r.hold_expires_at > now()))
    and daterange(r.starts_on, r.ends_on, '[]')
        && daterange(from_date, least(to_date, from_date + 366), '[]')
  order by r.starts_on;
$$;

-- 3. Payment history ----------------------------------------------------------

create type public.payment_kind as enum (
  'rental', 'refund', 'deposit_hold', 'deposit_release', 'deposit_capture'
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null references public.reservations (id) on delete restrict,
  customer_id uuid not null references public.profiles (id) on delete restrict,
  kind public.payment_kind not null,
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null check (currency ~ '^[a-z]{3}$'),
  -- The Stripe object behind the line: pi_... for payments and deposits, re_... for refunds.
  stripe_id text not null,
  created_at timestamptz not null default now(),
  -- The same Stripe object is never recorded twice for the same purpose.
  unique (kind, stripe_id)
);

create index payments_reservation_id_idx on public.payments (reservation_id);
create index payments_customer_id_idx on public.payments (customer_id);

alter table public.payments enable row level security;

create policy "Customers read their own payments; staff read all"
  on public.payments for select
  to authenticated
  using ((select auth.uid()) = customer_id or (select private.is_staff()));

revoke insert, update, delete on public.payments from anon, authenticated;

-- Stripe events already processed by the webhook. No policy: only the server
-- (service_role, which bypasses Row Level Security) reads and writes it.
create table public.stripe_events (
  id text primary key check (id ~ '^evt_'),
  type text not null,
  processed_at timestamptz not null default now()
);

alter table public.stripe_events enable row level security;
revoke all on public.stripe_events from anon, authenticated;

-- 4. Transitions, called only by server code with the secret key -------------

-- Puts an item on hold while the customer pays. Expired holds on the same item
-- are cancelled first, in the same transaction, so an abandoned checkout never
-- blocks an item for longer than its hold. A conflict raises 23P01.
create function public.place_checkout_hold(
  p_customer uuid,
  p_equipment uuid,
  p_starts_on date,
  p_ends_on date,
  p_rental_cents integer,
  p_deposit_cents integer,
  p_hold_until timestamptz
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  new_id uuid;
begin
  update public.reservations
     set status = 'cancelled', hold_expires_at = null
   where equipment_id = p_equipment
     and status = 'pending_payment'
     and hold_expires_at <= now();

  insert into public.reservations
    (equipment_id, customer_id, starts_on, ends_on, status, rental_cents, deposit_cents, hold_expires_at)
  values
    (p_equipment, p_customer, p_starts_on, p_ends_on, 'pending_payment', p_rental_cents, p_deposit_cents, p_hold_until)
  returning id into new_id;

  return new_id;
end;
$$;

-- Records a completed checkout. Returns what happened:
--   'confirmed'         the reservation is now confirmed;
--   'already_confirmed' this payment was recorded before (duplicate event);
--   'refund_needed'     the hold had expired and someone else took the dates;
--   'mismatch'          amount, currency or session do not match: nothing changed.
create function public.confirm_reservation_payment(
  p_reservation uuid,
  p_checkout_session text,
  p_payment_intent text,
  p_amount_cents integer,
  p_currency text
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  r public.reservations;
begin
  -- Lock the row: two deliveries of the same event wait for each other here.
  select * into r from public.reservations where id = p_reservation for update;

  if not found or r.checkout_session_id is distinct from p_checkout_session
     or p_amount_cents <> r.rental_cents or p_currency <> 'eur' then
    return 'mismatch';
  end if;

  if r.payment_intent_id = p_payment_intent then
    return 'already_confirmed';
  end if;

  insert into public.payments (reservation_id, customer_id, kind, amount_cents, currency, stripe_id)
  values (r.id, r.customer_id, 'rental', p_amount_cents, p_currency, p_payment_intent);

  begin
    -- A late payment for an expired hold still wins if the dates are free:
    -- the exclusion constraint decides, as for any other reservation.
    update public.reservations
       set status = 'confirmed', payment_intent_id = p_payment_intent,
           paid_at = now(), hold_expires_at = null
     where id = r.id;
    return 'confirmed';
  exception when exclusion_violation then
    update public.reservations
       set payment_intent_id = p_payment_intent, paid_at = now(),
           refund_due_cents = p_amount_cents
     where id = r.id;
    return 'refund_needed';
  end;
end;
$$;

-- An abandoned checkout: Stripe expired the session, so the item is free again.
create function public.expire_checkout_hold(p_reservation uuid, p_checkout_session text)
returns boolean
language sql
set search_path = ''
as $$
  with expired as (
    update public.reservations
       set status = 'cancelled', hold_expires_at = null
     where id = p_reservation
       and checkout_session_id = p_checkout_session
       and status = 'pending_payment'
    returning 1
  )
  select exists (select 1 from expired);
$$;

-- A customer cancels a paid reservation. The server computed the refund with
-- the cancellation policy; the item is released at once. Returns the payment
-- to refund, or nothing if the reservation cannot be cancelled.
create function public.cancel_paid_reservation(
  p_reservation uuid,
  p_customer uuid,
  p_refund_cents integer
)
returns table (payment_intent_id text, refund_due_cents integer)
language sql
set search_path = ''
as $$
  update public.reservations r
     set status = 'cancelled', refund_due_cents = least(p_refund_cents, r.rental_cents)
   where r.id = p_reservation
     and r.customer_id = p_customer
     and r.status = 'confirmed'
     and r.deposit_status = 'not_held'
     and p_refund_cents >= 0
  returning r.payment_intent_id, r.refund_due_cents;
$$;

-- Records a refund once (Stripe refund id re_...) and reduces what is still due.
create function public.record_refund(p_reservation uuid, p_refund text, p_amount_cents integer)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  inserted integer;
begin
  insert into public.payments (reservation_id, customer_id, kind, amount_cents, currency, stripe_id)
  select r.id, r.customer_id, 'refund', p_amount_cents, 'eur', p_refund
    from public.reservations r
   where r.id = p_reservation
  on conflict (kind, stripe_id) do nothing;
  get diagnostics inserted = row_count;

  if inserted = 1 then
    update public.reservations
       set refund_due_cents = greatest(refund_due_cents - p_amount_cents, 0)
     where id = p_reservation;
  end if;
  return inserted = 1;
end;
$$;

-- Deposit lifecycle at the depot: held at handover, then released or captured
-- at return (which completes the reservation). Each step happens once.
create function public.record_deposit(
  p_reservation uuid,
  p_kind public.payment_kind,
  p_payment_intent text,
  p_amount_cents integer
)
returns boolean
language plpgsql
set search_path = ''
as $$
declare
  r public.reservations;
begin
  select * into r from public.reservations where id = p_reservation for update;
  if not found or r.status <> 'confirmed' or p_amount_cents > r.deposit_cents then
    return false;
  end if;

  if p_kind = 'deposit_hold' and r.deposit_status = 'not_held' then
    update public.reservations
       set deposit_status = 'held', deposit_payment_intent_id = p_payment_intent
     where id = r.id;
  elsif p_kind in ('deposit_release', 'deposit_capture') and r.deposit_status = 'held'
        and r.deposit_payment_intent_id = p_payment_intent then
    update public.reservations
       set deposit_status = case when p_kind = 'deposit_release' then 'released'::public.deposit_status
                                 else 'captured'::public.deposit_status end,
           status = 'completed'
     where id = r.id;
  else
    return false;
  end if;

  insert into public.payments (reservation_id, customer_id, kind, amount_cents, currency, stripe_id)
  values (r.id, r.customer_id, p_kind, p_amount_cents, 'eur', p_payment_intent);
  return true;
end;
$$;

-- Only the server, with the secret key, runs these functions.
revoke execute on function
  public.place_checkout_hold(uuid, uuid, date, date, integer, integer, timestamptz),
  public.confirm_reservation_payment(uuid, text, text, integer, text),
  public.expire_checkout_hold(uuid, text),
  public.cancel_paid_reservation(uuid, uuid, integer),
  public.record_refund(uuid, text, integer),
  public.record_deposit(uuid, public.payment_kind, text, integer)
from public, anon, authenticated;

grant execute on function
  public.place_checkout_hold(uuid, uuid, date, date, integer, integer, timestamptz),
  public.confirm_reservation_payment(uuid, text, text, integer, text),
  public.expire_checkout_hold(uuid, text),
  public.cancel_paid_reservation(uuid, uuid, integer),
  public.record_refund(uuid, text, integer),
  public.record_deposit(uuid, public.payment_kind, text, integer)
to service_role;
