# RentRig: instructions for coding agents

Equipment rental platform for Harbor & Hoist Equipment. Read docs/PRD.md first.

## Commands
- `npm test` - unit tests (Vitest)
- `npm run test:db` - database tests (needs DATABASE_URL or `npx supabase start`)
- `npm run typecheck`

## Rules
- Money is integer cents. Never use floating-point amounts.
- Every table has Row Level Security; customers never insert reservations directly.
- Schema changes are new files in supabase/migrations/; never edit an applied migration.
- Write the test first for any pricing or availability rule.
