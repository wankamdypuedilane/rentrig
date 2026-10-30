-- Customers (profiles), staff role and reservations.

create type public.app_role as enum ('customer', 'staff');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 100),
  company_name text check (char_length(company_name) <= 120),
  role public.app_role not null default 'customer',
  created_at timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, left(coalesce(new.raw_user_meta_data ->> 'full_name', ''), 100));
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helpers that policies use live in a schema the Data API does not expose.
create schema private;
grant usage on schema private to authenticated;

create function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'staff'
  );
$$;

revoke execute on function private.is_staff() from public, anon;
grant execute on function private.is_staff() to authenticated;

create type public.reservation_status as enum (
  'pending_payment', 'confirmed', 'cancelled', 'completed'
);

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  equipment_id uuid not null references public.equipment (id) on delete restrict,
  customer_id uuid not null references public.profiles (id) on delete restrict,
  starts_on date not null,
  ends_on date not null,
  status public.reservation_status not null default 'pending_payment',
  rental_cents integer not null check (rental_cents >= 0),
  deposit_cents integer not null check (deposit_cents >= 0),
  created_at timestamptz not null default now(),
  constraint reservation_dates_in_order check (ends_on >= starts_on)
);

create index reservations_customer_id_idx on public.reservations (customer_id);
create index reservations_equipment_dates_idx on public.reservations (equipment_id, starts_on);

alter table public.profiles enable row level security;
alter table public.reservations enable row level security;

create policy "Customers read their own profile; staff read all"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id or (select private.is_staff()));

create policy "Customers update their own profile"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

revoke insert, update, delete on public.profiles from anon, authenticated;
grant update (full_name, company_name) on public.profiles to authenticated;

create policy "Customers read their own reservations; staff read all"
  on public.reservations for select
  to authenticated
  using ((select auth.uid()) = customer_id or (select private.is_staff()));

create policy "Staff update reservations"
  on public.reservations for update
  to authenticated
  using ((select private.is_staff()))
  with check ((select private.is_staff()));

-- Customers never insert reservations directly: the price and availability are
-- computed on the server (chapters 15 and 18), so the API cannot be used to
-- book at a price of one cent.
revoke insert, delete on public.reservations from anon, authenticated;
revoke update on public.reservations from anon;
