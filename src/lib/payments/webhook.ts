import type Stripe from "stripe";

export type ConfirmOutcome = "confirmed" | "already_confirmed" | "refund_needed" | "mismatch";

/** What the event handler needs from the outside world, injected for tests. */
export type WebhookDeps = {
  isProcessed(eventId: string): Promise<boolean>;
  markProcessed(eventId: string, type: string): Promise<void>;
  confirmPayment(input: {
    reservationId: string;
    sessionId: string;
    paymentIntentId: string;
    amountCents: number;
    currency: string;
  }): Promise<ConfirmOutcome>;
  expireHold(input: { reservationId: string; sessionId: string }): Promise<void>;
  issueDueRefund(reservationId: string): Promise<void>;
  log(message: string): void;
};

export type HandleResult =
  | "duplicate"
  | "ignored"
  | "unpaid"
  | "expired"
  | ConfirmOutcome;

function idOf(value: string | { id: string } | null): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

/**
 * Records the effect of a completed Checkout Session. Shared by the webhook and
 * the success page: whichever runs first confirms, the other finds it done.
 */
export async function fulfilCheckout(
  session: Stripe.Checkout.Session,
  deps: Pick<WebhookDeps, "confirmPayment" | "issueDueRefund" | "log">,
): Promise<HandleResult> {
  const reservationId = session.client_reference_id;
  const paymentIntentId = idOf(session.payment_intent);
  if (!reservationId || !paymentIntentId) return "ignored";
  // "paid" for cards; delayed methods would complete later (we accept cards only).
  if (session.payment_status !== "paid") return "unpaid";

  const outcome = await deps.confirmPayment({
    reservationId,
    sessionId: session.id,
    paymentIntentId,
    amountCents: session.amount_total ?? -1,
    currency: session.currency ?? "",
  });
  if (outcome === "refund_needed") {
    // The hold had expired and someone else took the dates: give the money back.
    await deps.issueDueRefund(reservationId);
  }
  if (outcome === "mismatch") {
    // Never confirm on a doubtful payment. Logged for the team, without card data.
    deps.log(`Checkout ${session.id} does not match reservation ${reservationId}`);
  }
  return outcome;
}

/** Handles one verified Stripe event. Every branch is safe to run twice. */
export async function handleStripeEvent(event: Stripe.Event, deps: WebhookDeps): Promise<HandleResult> {
  if (await deps.isProcessed(event.id)) return "duplicate";

  let result: HandleResult = "ignored";
  switch (event.type) {
    case "checkout.session.completed":
      result = await fulfilCheckout(event.data.object, deps);
      break;
    case "checkout.session.expired": {
      const session = event.data.object;
      if (session.client_reference_id) {
        await deps.expireHold({ reservationId: session.client_reference_id, sessionId: session.id });
        result = "expired";
      }
      break;
    }
  }
  // Recorded only after success: if anything above throws, Stripe retries.
  await deps.markProcessed(event.id, event.type);
  return result;
}
