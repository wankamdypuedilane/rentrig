import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asAnon, connect, createUser } from "./helpers";

let db: Client;
let karim: string;
let sophie: string;
let itemA: string; // first item of the catalogue
let itemB: string; // second item

// Reservations are created by trusted server code; here, the database owner.
const reserve = (client: Client, item: string, customer: string, from: string, to: string, status = "confirmed") =>
  client.query(
    `insert into public.reservations (equipment_id, customer_id, starts_on, ends_on, status, rental_cents, deposit_cents)
     values ($1, $2, $3, $4, $5, 10000, 5000) returning id`,
    [item, customer, from, to, status],
  );

beforeAll(async () => {
  db = await connect();
  karim = await createUser(db, "karim.avail@example.com", { full_name: "Karim Haddad" });
  sophie = await createUser(db, "sophie.avail@example.com", { full_name: "Sophie Bernard" });
  const { rows } = await db.query("select id from public.equipment order by name limit 2");
  [itemA, itemB] = rows.map((r) => r.id);
  await reserve(db, itemA!, karim, "2027-03-10", "2027-03-12");
});

afterAll(async () => {
  await db.query("delete from public.reservations where customer_id in ($1, $2)", [karim, sophie]);
  await db.end();
});

describe("double bookings", () => {
  it("are refused for overlapping dates on the same item", async () => {
    await expect(reserve(db, itemA!, sophie, "2027-03-12", "2027-03-15")).rejects.toMatchObject({
      code: "23P01",
      constraint: "no_overlapping_reservations",
    });
  });

  it("include both ends: returning on the 12th blocks a start on the 12th, not on the 13th", async () => {
    await expect(reserve(db, itemA!, sophie, "2027-03-05", "2027-03-10")).rejects.toMatchObject({ code: "23P01" });
    await db.query("begin");
    await expect(reserve(db, itemA!, sophie, "2027-03-13", "2027-03-14")).resolves.toBeDefined();
    await db.query("rollback");
  });

  it("do not concern another item, nor cancelled reservations", async () => {
    await db.query("begin");
    await expect(reserve(db, itemB!, sophie, "2027-03-10", "2027-03-12")).resolves.toBeDefined();
    await reserve(db, itemB!, karim, "2027-04-01", "2027-04-03", "cancelled");
    await expect(reserve(db, itemB!, sophie, "2027-04-01", "2027-04-03")).resolves.toBeDefined();
    await db.query("rollback");
  });

  it("are refused even when two requests race", async () => {
    const other = await connect();
    try {
      await db.query("begin");
      await other.query("begin");
      await reserve(db, itemB!, karim, "2027-05-01", "2027-05-07");
      const second = reserve(other, itemB!, sophie, "2027-05-05", "2027-05-09"); // blocks
      await db.query("commit");
      await expect(second).rejects.toMatchObject({ code: "23P01" });
      await other.query("rollback");
    } finally {
      await other.end();
    }
  });
});

describe("equipment_busy_dates", () => {
  it("shows visitors when an item is taken, and nothing else", async () => {
    const { rows } = await asAnon(db, () =>
      db.query("select * from public.equipment_busy_dates($1, '2027-03-01', '2027-03-31')", [itemA]),
    );
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0])).toEqual(["starts_on", "ends_on"]);
  });
});
