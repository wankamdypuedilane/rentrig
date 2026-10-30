# RentRig: Product Requirements (summary)

Client: Harbor & Hoist Equipment (fictional), a professional equipment rental
company with two depots. Today, customers reserve by phone; double bookings and
unpaid deposits cost about 6% of revenue.

## Goals
- Customers reserve available equipment online and pay at checkout.
- An item can never be reserved twice for overlapping dates.
- Deposits are held on the customer's card at handover and released or captured at return.
  (Changed in chapter 18: a card authorization lasts about 7 days, 5 for some Visa payments,
  so a deposit authorized at checkout would expire before rentals booked weeks ahead.)

## Users
- Customers: contractors (frequent, long rentals) and individuals (occasional).
- Staff: depot employees who confirm, hand over and close reservations.

## Rules
- Prices in integer euro cents. Each full week costs 5 daily prices; remaining days cost the daily price.
- Rentals last 1 to 90 days. Deposit shown separately.
- Customers read only their own reservations; staff read all.
- Customers never set prices: reservations are created by server code.
- Checkout holds the item for 45 minutes (Stripe session: 35 minutes); expired holds free the item.
- Cancellation: full refund up to two days before the start date (depot time, Europe/Dublin),
  half the rental the day before, no online cancellation from the start date.
- Payments are by card, in test mode during development; Stripe never sees our database, we never
  see card numbers.

## Scope by chapter
- Ch. 10: catalogue, customers, reservations schema, Row Level Security, pricing (TDD).
- Ch. 15: availability and double-booking prevention in the database.
- Ch. 18: Stripe checkout, webhooks, deposits, refunds, payment history.
