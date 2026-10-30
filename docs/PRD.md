# RentRig: Product Requirements (summary)

Client: Harbor & Hoist Equipment (fictional), a professional equipment rental
company with two depots. Today, customers reserve by phone; double bookings and
unpaid deposits cost about 6% of revenue.

## Goals
- Customers reserve available equipment online and pay at checkout.
- An item can never be reserved twice for overlapping dates.
- Deposits are authorized at checkout and released or captured at return.

## Users
- Customers: contractors (frequent, long rentals) and individuals (occasional).
- Staff: depot employees who confirm, hand over and close reservations.

## Rules
- Prices in integer cents. Each full week costs 5 daily prices; remaining days cost the daily price.
- Rentals last 1 to 90 days. Deposit shown separately.
- Customers read only their own reservations; staff read all.
- Customers never set prices: reservations are created by server code.

## Scope by chapter
- Ch. 10: catalogue, customers, reservations schema, Row Level Security, pricing (TDD).
- Ch. 15: availability and double-booking prevention in the database.
- Ch. 18: Stripe checkout, webhooks, deposits, refunds, payment history.
