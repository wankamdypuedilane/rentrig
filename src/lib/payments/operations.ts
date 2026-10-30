import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { CURRENCY } from "./money";
import * as store from "./store";
import { getStripe } from "./stripe";
import type { WebhookDeps } from "./webhook";

/** The customer's Stripe customer, created once and saved on the profile. */
export async function ensureStripeCustomer(user: { id: string; email: string | null }, name: string) {
  const saved = await store.getStripeCustomerId(user.id);
  if (saved) return saved;
  const customer = await getStripe().customers.create(
    { email: user.email ?? undefined, name, metadata: { profile_id: user.id } },
    // Two clicks at once create one customer, not two.
    { idempotencyKey: `customer-${user.id}` },
  );
  await store.saveStripeCustomerId(user.id, customer.id);
  return (await store.getStripeCustomerId(user.id)) ?? customer.id;
}

/** Refunds what is still due on a reservation, once, and records it. */
export async function issueDueRefund(reservationId: string) {
  const due = await store.getRefundDue(reservationId);
  if (!due.payment_intent_id || due.refund_due_cents <= 0) return;
  const refund = await getStripe().refunds.create(
    {
      payment_intent: due.payment_intent_id,
      amount: due.refund_due_cents,
      metadata: { reservation_id: reservationId },
    },
    // Retrying after a timeout returns the same refund instead of a second one.
    { idempotencyKey: `refund-${reservationId}-${due.refund_due_cents}` },
  );
  await store.recordRefund(reservationId, refund.id, refund.amount);
}

export const webhookDeps: WebhookDeps = {
  isProcessed: store.isEventProcessed,
  markProcessed: store.markEventProcessed,
  confirmPayment: store.confirmReservationPayment,
  expireHold: store.expireCheckoutHold,
  issueDueRefund,
  log: (message) => console.error(`[stripe] ${message}`),
};

type DepositRow = {
  status: string;
  deposit_cents: number;
  deposit_status: string;
  payment_intent_id: string | null;
  deposit_payment_intent_id: string | null;
  profiles: { stripe_customer_id: string | null } | null;
};

async function readDeposit(reservationId: string): Promise<DepositRow> {
  const { data, error } = await createAdminClient()
    .from("reservations")
    .select(
      "status, deposit_cents, deposit_status, payment_intent_id, deposit_payment_intent_id, profiles(stripe_customer_id)",
    )
    .eq("id", reservationId)
    .single<DepositRow>();
  if (error) throw new Error(`Could not read the reservation: ${error.message}`);
  return data;
}

export type DepositResult = { ok: true } | { ok: false; message: string };

/**
 * Holds the deposit on the card saved at checkout (handover at the depot).
 * The customer is not there to authenticate: an off-session payment, which
 * the bank may refuse with "authentication_required".
 */
export async function holdDeposit(reservationId: string): Promise<DepositResult> {
  const row = await readDeposit(reservationId);
  const customer = row.profiles?.stripe_customer_id;
  if (row.status !== "confirmed" || row.deposit_status !== "not_held" || !row.payment_intent_id || !customer) {
    return { ok: false, message: "This reservation is not ready for handover." };
  }
  if (row.deposit_cents === 0) {
    return { ok: false, message: "This item has no deposit." };
  }
  const stripe = getStripe();
  const rental = await stripe.paymentIntents.retrieve(row.payment_intent_id);
  const paymentMethod = typeof rental.payment_method === "string" ? rental.payment_method : rental.payment_method?.id;
  if (!paymentMethod) return { ok: false, message: "No saved card for this reservation." };

  try {
    const hold = await stripe.paymentIntents.create(
      {
        amount: row.deposit_cents,
        currency: CURRENCY,
        customer,
        payment_method: paymentMethod,
        capture_method: "manual", // authorize now, capture or cancel at return
        off_session: true,
        confirm: true,
        metadata: { reservation_id: reservationId, purpose: "deposit" },
      },
      { idempotencyKey: `deposit-hold-${reservationId}` },
    );
    if (hold.status !== "requires_capture") {
      return { ok: false, message: "The bank did not authorize the deposit." };
    }
    await store.recordDeposit(reservationId, "deposit_hold", hold.id, row.deposit_cents);
    return { ok: true };
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "authentication_required" || code === "card_declined") {
      return {
        ok: false,
        message: "The card was declined for the deposit. Take the deposit on the depot's card terminal instead.",
      };
    }
    throw error;
  }
}

/** Equipment returned in good condition: cancel the authorization (the hold disappears). */
export async function releaseDeposit(reservationId: string): Promise<DepositResult> {
  const row = await readDeposit(reservationId);
  if (row.deposit_status !== "held" || !row.deposit_payment_intent_id) {
    return { ok: false, message: "No deposit is held for this reservation." };
  }
  await getStripe().paymentIntents.cancel(
    row.deposit_payment_intent_id,
    {},
    { idempotencyKey: `deposit-release-${reservationId}` },
  );
  await store.recordDeposit(reservationId, "deposit_release", row.deposit_payment_intent_id, row.deposit_cents);
  return { ok: true };
}

/** Damage or late return: capture part of the deposit; Stripe releases the rest. */
export async function captureDeposit(reservationId: string, amountCents: number): Promise<DepositResult> {
  const row = await readDeposit(reservationId);
  if (row.deposit_status !== "held" || !row.deposit_payment_intent_id) {
    return { ok: false, message: "No deposit is held for this reservation." };
  }
  if (amountCents > row.deposit_cents) {
    return { ok: false, message: "You cannot keep more than the deposit." };
  }
  const captured = await getStripe().paymentIntents.capture(
    row.deposit_payment_intent_id,
    { amount_to_capture: amountCents },
    { idempotencyKey: `deposit-capture-${reservationId}` },
  );
  await store.recordDeposit(reservationId, "deposit_capture", captured.id, captured.amount_received);
  return { ok: true };
}
