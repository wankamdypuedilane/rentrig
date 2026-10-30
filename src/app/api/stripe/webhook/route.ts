import { webhookDeps } from "@/lib/payments/operations";
import { getStripe, webhookSecret } from "@/lib/payments/stripe";
import { handleStripeEvent } from "@/lib/payments/webhook";

// Stripe calls this endpoint for the events selected in the Dashboard (or
// forwarded by `stripe listen`). Anyone can send a request here: only the
// signature proves that it comes from Stripe.
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return Response.json({ error: "Missing signature" }, { status: 400 });

  // The signature covers the exact bytes Stripe sent: read the raw body,
  // never a parsed and re-serialized JSON object.
  const body = await request.text();

  let event;
  try {
    // Also rejects events older than 5 minutes (replayed requests).
    event = getStripe().webhooks.constructEvent(body, signature, webhookSecret());
  } catch {
    return Response.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    const result = await handleStripeEvent(event, webhookDeps);
    return Response.json({ received: true, result });
  } catch (error) {
    // A 500 makes Stripe retry later; every handler step is idempotent.
    console.error(`[stripe] ${event.type} ${event.id} failed`, error);
    return Response.json({ error: "Processing failed" }, { status: 500 });
  }
}
