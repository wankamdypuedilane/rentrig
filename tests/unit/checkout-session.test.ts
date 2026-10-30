import { describe, expect, it } from "vitest";
import { buildCheckoutSession } from "@/lib/payments/checkout";

const input = {
  reservationId: "00000000-0000-4000-8000-0000000000r1",
  stripeCustomerId: "cus_TestKarim",
  equipmentId: "00000000-0000-4000-8000-0000000000e1",
  equipmentName: "Aluminium scaffold tower 6 m",
  startsOn: "2027-03-15",
  endsOn: "2027-03-17",
  rentalCents: 16500,
  depositCents: 30000,
  expiresAt: new Date("2027-03-01T10:35:00Z"),
  siteUrl: "https://rentrig.example",
};

describe("Checkout Session parameters", () => {
  const params = buildCheckoutSession(input);

  it("charge the rental computed by the server, in euros, as a one-time payment", () => {
    expect(params.mode).toBe("payment");
    expect(params.line_items).toEqual([
      expect.objectContaining({
        quantity: 1,
        price_data: expect.objectContaining({ currency: "eur", unit_amount: 16500 }),
      }),
    ]);
  });

  it("link the session to the reservation and to the customer", () => {
    expect(params.client_reference_id).toBe(input.reservationId);
    expect(params.metadata).toEqual({ reservation_id: input.reservationId });
    expect(params.customer).toBe("cus_TestKarim");
  });

  it("accept cards only and save the card for the deposit", () => {
    expect(params.allowed_payment_method_types).toEqual(["card"]);
    expect(params.payment_intent_data?.setup_future_usage).toBe("off_session");
    expect(params.custom_text?.submit).toEqual({ message: expect.stringContaining("€300.00") });
  });

  it("expire with the hold, in seconds since the epoch", () => {
    expect(params.expires_at).toBe(Date.parse("2027-03-01T10:35:00Z") / 1000);
  });

  it("send the customer back with Stripe's session id placeholder", () => {
    expect(params.success_url).toBe("https://rentrig.example/checkout/success?session_id={CHECKOUT_SESSION_ID}");
    expect(params.cancel_url).toBe(`https://rentrig.example/equipment/${input.equipmentId}`);
  });
});
