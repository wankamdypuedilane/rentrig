import type Stripe from "stripe";

// Minimal Stripe events with only the fields our code reads. Real events carry
// many more; `as Stripe.Event` documents that this is a deliberate shortcut.
export function checkoutEvent(
  type: "checkout.session.completed" | "checkout.session.expired",
  session: Partial<Stripe.Checkout.Session> = {},
  id = "evt_test_1",
): Stripe.Event {
  return {
    id,
    object: "event",
    type,
    created: 1_800_000_000,
    data: {
      object: {
        id: "cs_test_1",
        object: "checkout.session",
        client_reference_id: "00000000-0000-4000-8000-0000000000r1",
        payment_intent: "pi_test_1",
        payment_status: type === "checkout.session.completed" ? "paid" : "unpaid",
        amount_total: 16500,
        currency: "eur",
        ...session,
      },
    },
  } as unknown as Stripe.Event;
}
