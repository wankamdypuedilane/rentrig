import { describe, expect, it } from "vitest";
import { quoteRental } from "@/lib/pricing";

// Harbor & Hoist pricing rules (from the PRD):
// - each full week (7 days) costs 5 times the daily price;
// - remaining days cost the daily price;
// - the deposit is shown separately and is not part of the rental price;
// - rentals last from 1 to 90 days.
describe("quoteRental", () => {
  it("charges the daily price for short rentals", () => {
    expect(quoteRental({ dailyPriceCents: 4500, depositCents: 15000, days: 3 })).toEqual({
      rentalCents: 13500,
      depositCents: 15000,
      totalDueNowCents: 28500,
    });
  });

  it("charges five days for each full week", () => {
    expect(quoteRental({ dailyPriceCents: 4500, depositCents: 0, days: 7 }).rentalCents).toBe(22500);
  });

  it("combines full weeks and remaining days", () => {
    // 1 week (5 x 4500) + 2 days (2 x 4500) = 31500
    expect(quoteRental({ dailyPriceCents: 4500, depositCents: 0, days: 9 }).rentalCents).toBe(31500);
  });

  it.each([0, -1, 91, 2.5])("rejects an invalid duration of %s days", (days) => {
    expect(() => quoteRental({ dailyPriceCents: 4500, depositCents: 0, days })).toThrow(RangeError);
  });

  it("rejects prices that are not whole positive cents", () => {
    expect(() => quoteRental({ dailyPriceCents: 45.5, depositCents: 0, days: 1 })).toThrow(RangeError);
  });
});
