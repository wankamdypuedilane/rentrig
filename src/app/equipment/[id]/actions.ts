"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getProfile, requireUser } from "@/lib/auth/current-user";
import { getEquipment } from "@/lib/catalog/queries";
import { buildCheckoutSession } from "@/lib/payments/checkout";
import { ensureStripeCustomer } from "@/lib/payments/operations";
import { checkoutWindow, depotDate, rentalDays } from "@/lib/payments/policy";
import { checkoutSchema } from "@/lib/payments/schemas";
import { DatesTakenError, attachCheckoutSession, placeCheckoutHold, releaseHold } from "@/lib/payments/store";
import { getStripe, hasStripe } from "@/lib/payments/stripe";
import { quoteRental } from "@/lib/pricing";
import { siteUrl } from "@/lib/site";

export type CheckoutState = {
  status: "idle" | "error";
  message?: string;
  fieldErrors?: Partial<Record<string, string[]>>;
};

export async function startCheckout(_prev: CheckoutState, formData: FormData): Promise<CheckoutState> {
  const parsed = checkoutSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { status: "error", message: "Please check the dates.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  }
  const { equipmentId, startsOn, endsOn } = parsed.data;
  const user = await requireUser(`/equipment/${equipmentId}`);
  if (!hasStripe) return { status: "error", message: "Online payment is not available yet. Please call the depot." };

  const now = new Date();
  if (startsOn < depotDate(now)) {
    return { status: "error", fieldErrors: { startsOn: ["The start date has already passed."] } };
  }
  // The price comes from the database and the pricing rules, never from the form.
  const equipment = await getEquipment(equipmentId);
  if (!equipment) return { status: "error", message: "This item is no longer available." };
  const quote = quoteRental({
    dailyPriceCents: equipment.daily_price_cents,
    depositCents: equipment.deposit_cents,
    days: rentalDays(startsOn, endsOn),
  });

  const profile = await getProfile();
  const stripeCustomerId = await ensureStripeCustomer(user, profile?.full_name ?? "");
  const { checkoutExpiresAt, holdExpiresAt } = checkoutWindow(now);

  let reservationId: string;
  try {
    reservationId = await placeCheckoutHold({
      customerId: user.id,
      equipmentId,
      startsOn,
      endsOn,
      rentalCents: quote.rentalCents,
      depositCents: quote.depositCents,
      holdUntil: holdExpiresAt,
    });
  } catch (error) {
    if (error instanceof DatesTakenError) {
      return { status: "error", message: "Someone booked these dates a moment ago. Please choose other dates." };
    }
    throw error;
  }

  let url: string | null = null;
  try {
    const session = await getStripe().checkout.sessions.create(
      buildCheckoutSession({
        reservationId,
        stripeCustomerId,
        equipmentId,
        equipmentName: equipment.name,
        startsOn,
        endsOn,
        rentalCents: quote.rentalCents,
        depositCents: quote.depositCents,
        expiresAt: checkoutExpiresAt,
        siteUrl,
      }),
      // A retried request returns the same session instead of a second one.
      { idempotencyKey: `checkout-${reservationId}` },
    );
    await attachCheckoutSession(reservationId, session.id);
    url = session.url;
  } catch (error) {
    // No session, no payment: free the item at once instead of waiting for the hold to expire.
    await releaseHold(reservationId);
    console.error("[stripe] could not create the Checkout Session", error);
  }
  if (!url) return { status: "error", message: "Payment is unavailable right now. Please try again." };
  // redirect() throws: it must stay outside try/catch. Absolute URLs are allowed.
  redirect(url);
}
