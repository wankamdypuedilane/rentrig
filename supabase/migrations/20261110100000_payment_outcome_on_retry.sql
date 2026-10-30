-- RentRig: a payment recorded twice reports its real outcome (found in review).
-- Before, a second delivery of a checkout whose dates had been taken returned
-- 'already_confirmed': the success page told the customer the reservation was
-- confirmed, and a failed refund was never retried. "create or replace" keeps
-- the function's privileges (service_role only).

create or replace function public.confirm_reservation_payment(
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
    -- Seen before. Say what really happened: a retried event (or the success page)
    -- after a refund_needed outcome must not report a confirmed reservation, and
    -- the caller must still be asked to issue the refund.
    if r.status = 'confirmed' then
      return 'already_confirmed';
    end if;
    return 'refund_needed';
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
