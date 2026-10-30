// RentRig charges in euros. Amounts are integer cents everywhere (see CLAUDE.md);
// Stripe also expects the smallest currency unit: 4500 means 45.00 EUR.
export const CURRENCY = "eur";

const formatter = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" });

/** Display only: an integer number of cents divided by 100 formats exactly to 2 decimals. */
export function formatMoney(cents: number): string {
  return formatter.format(cents / 100);
}

/** Parses an amount typed by staff ("45", "45.5" or "45,50") into cents, without floating point. */
export function parseMoneyInput(text: string): number | null {
  const match = /^(\d{1,6})(?:[.,](\d{1,2}))?$/.exec(text.trim());
  if (!match) return null;
  const [, units, decimals = ""] = match;
  return Number(units) * 100 + Number(decimals.padEnd(2, "0"));
}
