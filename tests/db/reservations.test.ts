import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asUser, connect, createUser } from "./helpers";

let db: Client;
let karim: string; // customer
let sophie: string; // customer
let lea: string; // staff
let washer: string;

beforeAll(async () => {
  db = await connect();
  karim = await createUser(db, "karim@example.com", { full_name: "Karim Haddad" });
  sophie = await createUser(db, "sophie@example.com", { full_name: "Sophie Bernard" });
  lea = await createUser(db, "lea@harborhoist.example", { full_name: "Léa Morel" });
  // Promoting staff is an administrative operation, done here as the database owner.
  await db.query("update public.profiles set role = 'staff' where id = $1", [lea]);
  washer = (
    await db.query("select id from public.equipment where name = 'Pressure washer 2500 W'")
  ).rows[0].id;
  // Reservations are created by trusted server code (here: the database owner).
  await db.query(
    `insert into public.reservations (equipment_id, customer_id, starts_on, ends_on, rental_cents, deposit_cents)
     values ($1, $2, '2026-12-12', '2026-12-14', 13500, 15000)`,
    [washer, karim],
  );
});

afterAll(async () => {
  await db.end();
});

const countReservations = async () =>
  Number((await db.query("select count(*) from public.reservations")).rows[0].count);

describe("reservations", () => {
  it("lets customers see only their own reservations", async () => {
    expect(await asUser(db, karim, countReservations)).toBe(1);
    expect(await asUser(db, sophie, countReservations)).toBe(0);
  });

  it("lets staff see every reservation", async () => {
    expect(await asUser(db, lea, countReservations)).toBe(1);
  });

  it("does not let customers create reservations with a price of their choosing", async () => {
    await expect(
      asUser(db, sophie, () =>
        db.query(
          `insert into public.reservations (equipment_id, customer_id, starts_on, ends_on, rental_cents, deposit_cents)
           values ($1, $2, '2026-12-20', '2026-12-21', 1, 0)`,
          [washer, sophie],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("does not let customers confirm their own reservation", async () => {
    const result = await asUser(db, karim, () =>
      db.query("update public.reservations set status = 'confirmed' where customer_id = $1", [karim]),
    );
    expect(result.rowCount).toBe(0);
  });

  it("lets staff confirm a reservation", async () => {
    const result = await asUser(db, lea, () =>
      db.query("update public.reservations set status = 'confirmed' where customer_id = $1", [karim]),
    );
    expect(result.rowCount).toBe(1);
  });

  it("rejects a reservation that ends before it starts", async () => {
    await expect(
      db.query(
        `insert into public.reservations (equipment_id, customer_id, starts_on, ends_on, rental_cents, deposit_cents)
         values ($1, $2, '2026-12-20', '2026-12-18', 0, 0)`,
        [washer, karim],
      ),
    ).rejects.toThrow(/reservation_dates_in_order/);
  });

  it("does not let customers promote themselves to staff", async () => {
    await expect(
      asUser(db, karim, () =>
        db.query("update public.profiles set role = 'staff' where id = $1", [karim]),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});
