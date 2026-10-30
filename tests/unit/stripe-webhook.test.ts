import { describe, expect, it, vi } from "vitest";
import { type WebhookDeps, handleStripeEvent } from "@/lib/payments/webhook";
import { checkoutEvent } from "../fixtures/stripe-events";

function fakeDeps(overrides: Partial<WebhookDeps> = {}): WebhookDeps {
  const processed = new Set<string>();
  return {
    isProcessed: vi.fn(async (id: string) => processed.has(id)),
    markProcessed: vi.fn(async (id: string) => void processed.add(id)),
    confirmPayment: vi.fn(async () => "confirmed" as const),
    expireHold: vi.fn(async () => {}),
    issueDueRefund: vi.fn(async () => {}),
    log: vi.fn(),
    ...overrides,
  };
}

describe("Stripe webhook events", () => {
  it("confirm the reservation of a paid Checkout Session", async () => {
    const deps = fakeDeps();
    expect(await handleStripeEvent(checkoutEvent("checkout.session.completed"), deps)).toBe("confirmed");
    expect(deps.confirmPayment).toHaveBeenCalledWith({
      reservationId: "00000000-0000-4000-8000-0000000000r1",
      sessionId: "cs_test_1",
      paymentIntentId: "pi_test_1",
      amountCents: 16500,
      currency: "eur",
    });
    expect(deps.markProcessed).toHaveBeenCalledWith("evt_test_1", "checkout.session.completed");
  });

  it("are processed once, even when Stripe delivers them twice", async () => {
    const deps = fakeDeps();
    const event = checkoutEvent("checkout.session.completed");
    await handleStripeEvent(event, deps);
    expect(await handleStripeEvent(event, deps)).toBe("duplicate");
    expect(deps.confirmPayment).toHaveBeenCalledTimes(1);
  });

  it("refund a late payment when someone else took the dates", async () => {
    const deps = fakeDeps({ confirmPayment: vi.fn(async () => "refund_needed" as const) });
    await handleStripeEvent(checkoutEvent("checkout.session.completed"), deps);
    expect(deps.issueDueRefund).toHaveBeenCalledWith("00000000-0000-4000-8000-0000000000r1");
  });

  it("never confirm a payment that does not match, and log it", async () => {
    const deps = fakeDeps({ confirmPayment: vi.fn(async () => "mismatch" as const) });
    expect(await handleStripeEvent(checkoutEvent("checkout.session.completed"), deps)).toBe("mismatch");
    expect(deps.log).toHaveBeenCalledWith(expect.stringContaining("does not match"));
    expect(deps.issueDueRefund).not.toHaveBeenCalled();
  });

  it("wait when the session is complete but not paid yet", async () => {
    const deps = fakeDeps();
    const event = checkoutEvent("checkout.session.completed", { payment_status: "unpaid" });
    expect(await handleStripeEvent(event, deps)).toBe("unpaid");
    expect(deps.confirmPayment).not.toHaveBeenCalled();
  });

  it("free the item when the session expires", async () => {
    const deps = fakeDeps();
    expect(await handleStripeEvent(checkoutEvent("checkout.session.expired"), deps)).toBe("expired");
    expect(deps.expireHold).toHaveBeenCalledWith({
      reservationId: "00000000-0000-4000-8000-0000000000r1",
      sessionId: "cs_test_1",
    });
  });

  it("ignore other event types", async () => {
    const deps = fakeDeps();
    const event = { ...checkoutEvent("checkout.session.completed"), type: "customer.created" } as never;
    expect(await handleStripeEvent(event, deps)).toBe("ignored");
    expect(deps.confirmPayment).not.toHaveBeenCalled();
  });

  it("are not marked as processed when handling fails, so that Stripe retries", async () => {
    const deps = fakeDeps({ confirmPayment: vi.fn(async () => Promise.reject(new Error("database down"))) });
    await expect(handleStripeEvent(checkoutEvent("checkout.session.completed"), deps)).rejects.toThrow("database down");
    expect(deps.markProcessed).not.toHaveBeenCalled();
  });
});
