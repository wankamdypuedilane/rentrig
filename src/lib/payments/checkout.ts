import type Stripe from "stripe";
import { CURRENCY, formatMoney } from "./money";

export type CheckoutInput = {
  reservationId: string;
  stripeCustomerId: string;
  equipmentId: string;
  equipmentName: string;
  startsOn: string;
  endsOn: string;
  rentalCents: number;
  depositCents: number;
  expiresAt: Date;
  siteUrl: string;
};

/**
 * The Checkout Session for one reservation. Pure: the amount comes from the
 * reservation the server created, never from the browser.
 */
export function buildCheckoutSession(input: CheckoutInput): Stripe.Checkout.SessionCreateParams {
  return {
    mode: "payment",
    customer: input.stripeCustomerId,
    // Lets the webhook find the reservation without trusting anything else.
    client_reference_id: input.reservationId,
    metadata: { reservation_id: input.reservationId },
    // Cards only: the deposit is held later, at the depot, on the card saved here.
    // (stripe 23 replaced payment_method_types with this filter.)
    allowed_payment_method_types: ["card"],
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: CURRENCY,
          unit_amount: input.rentalCents,
          product_data: {
            name: input.equipmentName,
            description: `Rental from ${input.startsOn} to ${input.endsOn}`,
          },
        },
      },
    ],
    payment_intent_data: {
      // Save the card for an off-session payment: the deposit hold at handover.
      setup_future_usage: "off_session",
      metadata: { reservation_id: input.reservationId },
    },
    custom_text: {
      submit: {
        message: `A deposit of ${formatMoney(input.depositCents)} will be held on this card when you collect the equipment, and released when you return it.`,
      },
    },
    expires_at: Math.floor(input.expiresAt.getTime() / 1000),
    // Stripe replaces {CHECKOUT_SESSION_ID} with the session id.
    success_url: `${input.siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${input.siteUrl}/equipment/${input.equipmentId}`,
  };
}
