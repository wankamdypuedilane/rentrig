# RentRig

Equipment rental platform for **Harbor & Hoist Equipment** (a fictional company).
Companion project of the book *Mastering AI-Assisted Full-Stack Application
Development* by WANKAM Dypue Dilane Junior (2026). Milestone branches `chNN-end`
match the end of chapter NN.

At `ch10-end` the project contains the database schema (catalogue, customers,
reservations) with Row Level Security, sample data, the pricing rules written
test-first, and the tests. The web application is added in later chapters.

```bash
npm install
npm test                       # pricing rules
npx supabase start             # local Supabase (Docker), or any PostgreSQL:
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/postgres npm run test:db
```

License: MIT.
