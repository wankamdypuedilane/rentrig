# RentRig: instructions for coding agents

Equipment rental platform for Harbor & Hoist Equipment. Read docs/PRD.md first.

## Commands
- `npm test` - unit tests (Vitest)
- `npm run test:db` - database tests (needs DATABASE_URL or `npx supabase start`)
- `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:e2e`
- Run lint, typecheck and tests before saying a task is done, and show the output.

## Stack
- Next.js 16 (App Router, `src/`, Cache Components), React 19, Tailwind 4, shadcn/ui
- Supabase through `@supabase/ssr`; Stripe Node SDK (`stripe`, pinned API version)

## Rules
- Money is integer cents. Never use floating-point amounts.
- Every table has Row Level Security; customers never insert reservations directly.
- Schema changes are new files in supabase/migrations/; never edit an applied migration.
- Write the test first for any pricing or availability rule.
- Stripe runs in TEST MODE only: keys are sk_test_/rk_test_ (the env schema refuses live keys);
  .env.example holds fictional YOUR_... placeholders.
- The browser sends ids and dates, never amounts: prices come from the database and src/lib/pricing.ts.
- Payment state changes go through the SQL functions of the payments migration (service_role only);
  every one is idempotent, and every Stripe POST carries an idempotency key.
- The webhook verifies the signature on the raw body (`await request.text()`), never on parsed JSON.
- Payment rules (refunds, checkout window, depot dates) are pure functions in src/lib/payments/ with tests.
