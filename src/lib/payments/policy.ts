// RentRig payment rules, as pure functions: no clock, no database, no Stripe.

/** Rental dates are calendar dates at the depot. */
export const DEPOT_TIME_ZONE = "Europe/Dublin";

/** The calendar date (YYYY-MM-DD) at the depot at a given instant. */
export function depotDate(at: Date): string {
  // The en-CA locale formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DEPOT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** Whole days from one calendar date to another (negative if `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
}

/** Both ends are included: from the 12th to the 14th is three days. */
export function rentalDays(startsOn: string, endsOn: string): number {
  return daysBetween(startsOn, endsOn) + 1;
}

/**
 * How long the item stays on hold while the customer pays. Stripe accepts an
 * expiry 30 minutes to 24 hours after the Checkout Session is created; 35
 * minutes leaves a margin for clock and network delays. The hold lasts a little
 * longer than the session, so a payment made at the last second still finds it.
 */
export const CHECKOUT_MINUTES = 35;
export const HOLD_GRACE_MINUTES = 10;

export function checkoutWindow(now: Date) {
  const checkoutExpiresAt = new Date(now.getTime() + CHECKOUT_MINUTES * 60_000);
  const holdExpiresAt = new Date(checkoutExpiresAt.getTime() + HOLD_GRACE_MINUTES * 60_000);
  return { checkoutExpiresAt, holdExpiresAt };
}

export type CancellationRefund =
  | { allowed: true; rule: "full" | "half"; refundCents: number }
  | { allowed: false; rule: "started"; refundCents: 0 };

/**
 * Cancellation policy: a full refund up to two days before the start date,
 * half the rental the day before, and no online cancellation from the start
 * date on (the customer calls the depot).
 */
export function refundForCancellation(input: {
  startsOn: string;
  rentalCents: number;
  now: Date;
}): CancellationRefund {
  const daysLeft = daysBetween(depotDate(input.now), input.startsOn);
  if (daysLeft >= 2) return { allowed: true, rule: "full", refundCents: input.rentalCents };
  if (daysLeft === 1) {
    // Integer cents: an odd amount rounds down in the customer's disfavour by at most one cent.
    return { allowed: true, rule: "half", refundCents: Math.floor(input.rentalCents / 2) };
  }
  return { allowed: false, rule: "started", refundCents: 0 };
}
