import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asAnon, connect } from "./helpers";

let db: Client;
beforeAll(async () => {
  db = await connect();
});
afterAll(async () => {
  await db.end();
});

describe("catalogue", () => {
  it("shows active equipment to anonymous visitors, cheapest first", async () => {
    const rows = await asAnon(db, async () =>
      (
        await db.query(
          "select name, daily_price_cents from public.equipment order by daily_price_cents limit 2",
        )
      ).rows,
    );
    expect(rows).toEqual([
      { name: "Tile cutter 1200 mm", daily_price_cents: 3900 },
      { name: "Pressure washer 2500 W", daily_price_cents: 4500 },
    ]);
  });

  it("hides inactive equipment", async () => {
    const rows = await asAnon(db, async () =>
      (await db.query("select name from public.equipment where name = 'Floor scrubber'")).rows,
    );
    expect(rows).toHaveLength(0);
  });

  it("does not let visitors change prices", async () => {
    await expect(
      asAnon(db, () => db.query("update public.equipment set daily_price_cents = 1")),
    ).rejects.toThrow(/permission denied/);
  });

  it("rejects prices that are not positive", async () => {
    await expect(
      db.query(
        "insert into public.equipment (category_id, name, daily_price_cents) values (1, 'Broken', 0)",
      ),
    ).rejects.toThrow(/equipment_daily_price_cents_check/);
  });
});
