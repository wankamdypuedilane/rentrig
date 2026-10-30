import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ConfirmOutcome } from "./webhook";

// Payment state changes, run with the secret key through the SQL functions of
// the chapter 18 migration. Each function is idempotent; see the migration.

export class DatesTakenError extends Error {}

export async function placeCheckoutHold(input: {
  customerId: string;
  equipmentId: string;
  startsOn: string;
  endsOn: string;
  rentalCents: number;
  depositCents: number;
  holdUntil: Date;
}): Promise<string> {
  const { data, error } = await createAdminClient().rpc("place_checkout_hold", {
    p_customer: input.customerId,
    p_equipment: input.equipmentId,
    p_starts_on: input.startsOn,
    p_ends_on: input.endsOn,
    p_rental_cents: input.rentalCents,
    p_deposit_cents: input.depositCents,
    p_hold_until: input.holdUntil.toISOString(),
  });
  // 23P01 = exclusion_violation: the dates overlap another reservation.
  if (error?.code === "23P01") throw new DatesTakenError();
  if (error) throw new Error(`Could not place the hold: ${error.message}`);
  return data as string;
}

export async function attachCheckoutSession(reservationId: string, sessionId: string) {
  const { error } = await createAdminClient()
    .from("reservations")
    .update({ checkout_session_id: sessionId })
    .eq("id", reservationId)
    .eq("status", "pending_payment");
  if (error) throw new Error(`Could not attach the session: ${error.message}`);
}

/** Frees an item at once when the Checkout Session could not be created. */
export async function releaseHold(reservationId: string) {
  await createAdminClient()
    .from("reservations")
    .update({ status: "cancelled", hold_expires_at: null })
    .eq("id", reservationId)
    .eq("status", "pending_payment");
}

export async function confirmReservationPayment(input: {
  reservationId: string;
  sessionId: string;
  paymentIntentId: string;
  amountCents: number;
  currency: string;
}): Promise<ConfirmOutcome> {
  const { data, error } = await createAdminClient().rpc("confirm_reservation_payment", {
    p_reservation: input.reservationId,
    p_checkout_session: input.sessionId,
    p_payment_intent: input.paymentIntentId,
    p_amount_cents: input.amountCents,
    p_currency: input.currency,
  });
  if (error) throw new Error(`Could not confirm the payment: ${error.message}`);
  return data as ConfirmOutcome;
}

export async function expireCheckoutHold(input: { reservationId: string; sessionId: string }) {
  const { error } = await createAdminClient().rpc("expire_checkout_hold", {
    p_reservation: input.reservationId,
    p_checkout_session: input.sessionId,
  });
  if (error) throw new Error(`Could not expire the hold: ${error.message}`);
}

export async function cancelPaidReservation(reservationId: string, customerId: string, refundCents: number) {
  const { data, error } = await createAdminClient()
    .rpc("cancel_paid_reservation", {
      p_reservation: reservationId,
      p_customer: customerId,
      p_refund_cents: refundCents,
    })
    .maybeSingle<{ payment_intent_id: string; refund_due_cents: number }>();
  if (error) throw new Error(`Could not cancel the reservation: ${error.message}`);
  return data; // null when the reservation cannot be cancelled
}

export async function getRefundDue(reservationId: string) {
  const { data, error } = await createAdminClient()
    .from("reservations")
    .select("payment_intent_id, refund_due_cents")
    .eq("id", reservationId)
    .single<{ payment_intent_id: string | null; refund_due_cents: number }>();
  if (error) throw new Error(`Could not read the refund: ${error.message}`);
  return data;
}

export async function recordRefund(reservationId: string, refundId: string, amountCents: number) {
  const { error } = await createAdminClient().rpc("record_refund", {
    p_reservation: reservationId,
    p_refund: refundId,
    p_amount_cents: amountCents,
  });
  if (error) throw new Error(`Could not record the refund: ${error.message}`);
}

export type DepositKind = "deposit_hold" | "deposit_release" | "deposit_capture";

export async function recordDeposit(
  reservationId: string,
  kind: DepositKind,
  paymentIntentId: string,
  amountCents: number,
): Promise<boolean> {
  const { data, error } = await createAdminClient().rpc("record_deposit", {
    p_reservation: reservationId,
    p_kind: kind,
    p_payment_intent: paymentIntentId,
    p_amount_cents: amountCents,
  });
  if (error) throw new Error(`Could not record the deposit: ${error.message}`);
  return data as boolean;
}

export async function isEventProcessed(eventId: string): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from("stripe_events")
    .select("id")
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw new Error(`Could not read processed events: ${error.message}`);
  return data !== null;
}

export async function markEventProcessed(eventId: string, type: string) {
  // upsert: two concurrent deliveries of the same event both succeed.
  const { error } = await createAdminClient()
    .from("stripe_events")
    .upsert({ id: eventId, type }, { onConflict: "id", ignoreDuplicates: true });
  if (error) throw new Error(`Could not record the event: ${error.message}`);
}

/** The Stripe customer id saved on a profile, if any. */
export async function getStripeCustomerId(userId: string): Promise<string | null> {
  const { data } = await createAdminClient()
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", userId)
    .single<{ stripe_customer_id: string | null }>();
  return data?.stripe_customer_id ?? null;
}

export async function saveStripeCustomerId(userId: string, customerId: string) {
  // Only fills an empty column: a concurrent request cannot overwrite it.
  const { error } = await createAdminClient()
    .from("profiles")
    .update({ stripe_customer_id: customerId })
    .eq("id", userId)
    .is("stripe_customer_id", null);
  if (error) throw new Error(`Could not save the customer: ${error.message}`);
}
