import { describe, expect, it } from "vitest";
import { formatMoney, parseMoneyInput } from "@/lib/payments/money";
import { checkoutWindow, depotDate, refundForCancellation, rentalDays } from "@/lib/payments/policy";
import { checkoutSchema, depositCaptureSchema } from "@/lib/payments/schemas";

describe("money", () => {
  it("formats integer cents as euros", () => {
    expect(formatMoney(16500)).toBe("€165.00");
    expect(formatMoney(5)).toBe("€0.05");
  });

  it("parses typed amounts into cents without floating point", () => {
    expect(parseMoneyInput("45")).toBe(4500);
    expect(parseMoneyInput("45.5")).toBe(4550);
    expect(parseMoneyInput(" 45,05 ")).toBe(4505);
    expect(parseMoneyInput("0.29")).toBe(29); // 0.29 * 100 is 28.999999999999996 in floating point
    for (const bad of ["", "-5", "4.555", "1e3", "abc", "1234567"]) {
      expect(parseMoneyInput(bad), bad).toBeNull();
    }
  });
});

describe("calendar dates at the depot", () => {
  it("use the depot's time zone, not the server's", () => {
    // 23:30 UTC on 31 March 2027 is already 1 April in Dublin (summer time, UTC+1).
    expect(depotDate(new Date("2027-03-31T23:30:00Z"))).toBe("2027-04-01");
    // In winter Dublin is on UTC.
    expect(depotDate(new Date("2027-01-31T23:30:00Z"))).toBe("2027-01-31");
  });

  it("count both ends of a rental, across a daylight saving change", () => {
    expect(rentalDays("2027-03-12", "2027-03-14")).toBe(3);
    expect(rentalDays("2027-03-27", "2027-03-29")).toBe(3); // clocks change on 28 March 2027
  });
});

describe("checkout window", () => {
  it("keeps the hold a little longer than the Stripe session", () => {
    const now = new Date("2027-03-01T10:00:00Z");
    const { checkoutExpiresAt, holdExpiresAt } = checkoutWindow(now);
    expect(checkoutExpiresAt.toISOString()).toBe("2027-03-01T10:35:00.000Z");
    expect(holdExpiresAt.toISOString()).toBe("2027-03-01T10:45:00.000Z");
  });
});

describe("cancellation refunds", () => {
  const at = (iso: string) => new Date(iso);
  const rental = { startsOn: "2027-04-15", rentalCents: 16501 }; // Dublin is on summer time (UTC+1)

  it("are full up to two days before the start date", () => {
    expect(refundForCancellation({ ...rental, now: at("2027-04-13T22:59:00Z") })).toEqual({
      allowed: true, rule: "full", refundCents: 16501,
    });
  });

  it("are half the rental the day before, rounded down to a whole cent", () => {
    // 23:30 UTC on the 13th is already 00:30 on the 14th in Dublin.
    expect(refundForCancellation({ ...rental, now: at("2027-04-13T23:30:00Z") })).toEqual({
      allowed: true, rule: "half", refundCents: 8250,
    });
  });

  it("are refused online from the start date", () => {
    expect(refundForCancellation({ ...rental, now: at("2027-04-15T08:00:00Z") })).toMatchObject({ allowed: false });
    expect(refundForCancellation({ ...rental, now: at("2027-04-20T08:00:00Z") })).toMatchObject({ allowed: false });
  });
});

describe("checkout form", () => {
  const id = "00000000-0000-4000-8000-0000000000e1";

  it("accepts ids and dates, and ignores anything else such as a price", () => {
    const parsed = checkoutSchema.parse({ equipmentId: id, startsOn: "2027-03-15", endsOn: "2027-03-15", rentalCents: "1" });
    expect(parsed).toEqual({ equipmentId: id, startsOn: "2027-03-15", endsOn: "2027-03-15" });
  });

  it("refuses dates in the wrong order, impossible dates and rentals over 90 days", () => {
    expect(checkoutSchema.safeParse({ equipmentId: id, startsOn: "2027-03-15", endsOn: "2027-03-14" }).success).toBe(false);
    expect(checkoutSchema.safeParse({ equipmentId: id, startsOn: "2027-02-30", endsOn: "2027-03-01" }).success).toBe(false);
    expect(checkoutSchema.safeParse({ equipmentId: id, startsOn: "2027-01-01", endsOn: "2027-03-31" }).success).toBe(true); // 90 days
    expect(checkoutSchema.safeParse({ equipmentId: id, startsOn: "2027-01-01", endsOn: "2027-04-01" }).success).toBe(false);
  });

  it("turns the amount kept from a deposit into cents", () => {
    expect(depositCaptureSchema.parse({ reservationId: id, amount: "45.50" })).toEqual({ reservationId: id, amount: 4550 });
    expect(depositCaptureSchema.safeParse({ reservationId: id, amount: "0" }).success).toBe(false);
    expect(depositCaptureSchema.safeParse({ reservationId: id, amount: "lots" }).success).toBe(false);
  });
});
