# RentRig: decisions

## 2026-11-10 Payments with Stripe (chapter 18)

- **Stripe Checkout (hosted page)** rather than a custom card form: card numbers never
  reach our servers, and Stripe handles card authentication (3D Secure).
- **Test mode only** in this project. The env schema accepts `sk_test_`/`rk_test_` keys only.
- **Pending reservation first, payment second.** The server places a hold
  (`place_checkout_hold`), then creates the Checkout Session with the reservation id in
  `client_reference_id` and `metadata`. The exclusion constraint of chapter 15 decides
  conflicts; nobody checks availability before inserting.
- **Holds expire.** Session `expires_at` = now + 35 min (Stripe accepts 30 min to 24 h);
  the hold lasts 10 more minutes. Expired holds are cancelled when someone else books the
  same item, and by the `checkout.session.expired` webhook.
- **Late payments**: if a payment arrives after its hold expired, the reservation is
  confirmed when the dates are still free (the constraint decides), otherwise refunded in full.
- **Fulfilment is idempotent and runs twice**: from the webhook and from the success page,
  as Stripe recommends. SQL functions lock the row and check state; `payments` has a
  unique `(kind, stripe_id)`; processed event ids are stored in `stripe_events` after success.
- **Idempotency keys** on every Stripe POST, derived from our ids (`checkout-<reservation>`,
  `refund-<reservation>-<amount>`, `deposit-hold-<reservation>`...). Stripe may prune keys
  after 24 hours: they protect retries, not long-term uniqueness (the database does that).
- **Deposit at handover, not at checkout**: card authorizations expire after about 7 days
  (Visa merchant-initiated: 5 days). The card is saved at checkout
  (`setup_future_usage: off_session`); staff hold the deposit with a manual-capture
  PaymentIntent at handover, then cancel it (release) or capture part of it at return.
  If the bank requires authentication off-session, staff use the depot's terminal instead.
- **Cards only** (`allowed_payment_method_types: ["card"]`): the deposit needs a card.
  stripe 23 (API 2026-09-30) removed `payment_method_types` from Checkout Session creation.
- **Currency** EUR, depot time zone Europe/Dublin for calendar dates.
