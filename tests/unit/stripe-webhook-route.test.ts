// @vitest-environment node
import Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkoutEvent } from "../fixtures/stripe-events";

// A fictional signing secret: the real one comes from `stripe listen` or the Dashboard.
const SECRET = "whsec_test_YOUR_WEBHOOK_SECRET";
const stripe = new Stripe("sk_test_YOUR_SECRET_KEY");

const deps = vi.hoisted(() => ({
  isProcessed: vi.fn(async () => false),
  markProcessed: vi.fn(async () => {}),
  confirmPayment: vi.fn(async () => "confirmed"),
  expireHold: vi.fn(async () => {}),
  issueDueRefund: vi.fn(async () => {}),
  log: vi.fn(),
}));

// The route uses the real signature check; only the database side is replaced.
vi.mock("@/lib/payments/stripe", () => ({ getStripe: () => stripe, webhookSecret: () => SECRET }));
vi.mock("@/lib/payments/operations", () => ({ webhookDeps: deps }));

const { POST } = await import("@/app/api/stripe/webhook/route");

function signedRequest(body: string, options: { secret?: string; timestamp?: number } = {}) {
  const signature = stripe.webhooks.generateTestHeaderString({
    payload: body,
    secret: options.secret ?? SECRET,
    timestamp: options.timestamp,
  });
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": signature, "content-type": "application/json" },
    body,
  });
}

const body = JSON.stringify(checkoutEvent("checkout.session.completed"));

describe("POST /api/stripe/webhook", () => {
  beforeEach(() => vi.clearAllMocks());

  it("accepts an event signed with our secret and confirms the payment", async () => {
    const response = await POST(signedRequest(body));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true, result: "confirmed" });
    expect(deps.confirmPayment).toHaveBeenCalledOnce();
  });

  it("rejects a request without a signature", async () => {
    const request = new Request("http://localhost/api/stripe/webhook", { method: "POST", body });
    expect((await POST(request)).status).toBe(400);
    expect(deps.confirmPayment).not.toHaveBeenCalled();
  });

  it("rejects an event signed with another secret", async () => {
    const response = await POST(signedRequest(body, { secret: "whsec_test_SOMEONE_ELSE" }));
    expect(response.status).toBe(400);
    expect(deps.confirmPayment).not.toHaveBeenCalled();
  });

  it("rejects a body changed after signing, even only re-formatted", async () => {
    const signed = signedRequest(body);
    const reformatted = JSON.stringify(JSON.parse(body), null, 2); // same data, different bytes
    const request = new Request(signed.url, { method: "POST", headers: signed.headers, body: reformatted });
    expect((await POST(request)).status).toBe(400);
  });

  it("rejects a replayed event older than five minutes", async () => {
    const tenMinutesAgo = Math.floor(Date.now() / 1000) - 600;
    expect((await POST(signedRequest(body, { timestamp: tenMinutesAgo }))).status).toBe(400);
  });

  it("answers 500 when processing fails, so that Stripe retries", async () => {
    deps.confirmPayment.mockRejectedValueOnce(new Error("database down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await POST(signedRequest(body))).status).toBe(500);
  });
});
