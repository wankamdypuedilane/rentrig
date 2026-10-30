export type QuoteInput = {
  dailyPriceCents: number;
  depositCents: number;
  days: number;
};

export type Quote = {
  rentalCents: number;
  depositCents: number;
  /** Rental plus deposit: the amount authorized at checkout. */
  totalDueNowCents: number;
};

const MAX_DAYS = 90;
const DAYS_CHARGED_PER_WEEK = 5;

function assertCents(value: number, name: string, allowZero: boolean) {
  if (!Number.isInteger(value) || value < 0 || (!allowZero && value === 0)) {
    throw new RangeError(`${name} must be a whole number of cents`);
  }
}

// Money is always handled in integer cents: 0.1 + 0.2 !== 0.3 in floating point.
export function quoteRental({ dailyPriceCents, depositCents, days }: QuoteInput): Quote {
  assertCents(dailyPriceCents, "dailyPriceCents", false);
  assertCents(depositCents, "depositCents", true);
  if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) {
    throw new RangeError(`days must be an integer between 1 and ${MAX_DAYS}`);
  }

  const fullWeeks = Math.floor(days / 7);
  const remainingDays = days % 7;
  const rentalCents =
    (fullWeeks * DAYS_CHARGED_PER_WEEK + remainingDays) * dailyPriceCents;

  return { rentalCents, depositCents, totalDueNowCents: rentalCents + depositCents };
}
