# RentRig

Equipment rental platform for **Harbor & Hoist Equipment** (a fictional company).
Companion project of the book *Mastering AI-Assisted Full-Stack Application
Development* by WANKAM Dypue Dilane Junior (2026). Milestone branches `chNN-end`
match the end of chapter NN.

At `ch10-end` the project contains the database schema (catalogue, customers,
reservations) with Row Level Security, sample data, the pricing rules written
test-first, and the tests. At `ch15-end`, an exclusion constraint makes
overlapping reservations of the same item impossible, and
`equipment_busy_dates()` publishes busy dates without customer data.

At `ch18-end` RentRig is a Next.js 16 application with Stripe payments in
**test mode only**: Stripe Checkout for the rental, a signed webhook that
confirms reservations idempotently, refunds on cancellation, and the deposit
held on the saved card at handover (manual capture), then released or partly
captured at return. See `docs/DECISIONS.md`.

```bash
npm install
cp .env.example .env.local     # fictional placeholders: put your own TEST keys
npm test                       # unit tests (pricing, payment rules, webhook)
npx supabase start             # local Supabase (Docker), or any PostgreSQL:
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres npm run test:db
npm run test:e2e               # end-to-end tests on the /design/checkout preview
# Webhooks in development (Stripe CLI, test mode):
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

License: MIT.
