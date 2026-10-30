import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { asAnon, asService, asUser, connect, createUser } from "./helpers";

let db: Client;
let karim: string;
let sophie: string;
let staff: string;
let item: string;

const FUTURE = "2099-01-01T00:00:00Z";
const PAST = "2000-01-01T00:00:00Z";

// The server places a hold with the price it computed (here: 3 days at 55.00, deposit 300.00).
async function hold(customer: string, from: string, to: string, until = FUTURE): Promise<string> {
  const { rows } = await db.query(
    "select public.place_checkout_hold($1, $2, $3, $4, 16500, 30000, $5) as id",
    [customer, item, from, to, until],
  );
  return rows[0].id;
}

async function attachSession(reservation: string, session: string) {
  await db.query("update public.reservations set checkout_session_id = $2 where id = $1", [reservation, session]);
}

async function confirm(reservation: string, session: string, intent: string, amount = 16500, currency = "eur") {
  const { rows } = await db.query(
    "select public.confirm_reservation_payment($1, $2, $3, $4, $5) as outcome",
    [reservation, session, intent, amount, currency],
  );
  return rows[0].outcome as string;
}

async function reservation(id: string) {
  const { rows } = await db.query("select * from public.reservations where id = $1", [id]);
  return rows[0];
}

async function payments(reservationId: string) {
  const { rows } = await db.query(
    "select kind, amount_cents, stripe_id from public.payments where reservation_id = $1 order by created_at, kind",
    [reservationId],
  );
  return rows;
}

beforeAll(async () => {
  db = await connect();
  karim = await createUser(db, "karim.pay@example.com", { full_name: "Karim Haddad", company_name: "Haddad Builders" });
  sophie = await createUser(db, "sophie.pay@example.com", { full_name: "Sophie Bernard" });
  staff = await createUser(db, "depot.pay@example.com", { full_name: "Depot Team" });
  await db.query("update public.profiles set role = 'staff' where id = $1", [staff]);
  const { rows } = await db.query("select id from public.equipment where is_active order by name limit 1");
  item = rows[0].id;
});

afterAll(async () => {
  const users = [karim, sophie, staff];
  await db.query("delete from public.payments where customer_id = any($1)", [users]);
  await db.query("delete from public.reservations where customer_id = any($1)", [users]);
  await db.end();
});

describe("sign-up", () => {
  it("stores the optional company name", async () => {
    const { rows } = await db.query("select company_name from public.profiles where id = any($1) order by full_name", [[karim, sophie]]);
    expect(rows.map((r) => r.company_name)).toEqual(["Haddad Builders", null]);
  });
});

describe("checkout holds", () => {
  it("block the dates while the customer pays", async () => {
    await asService(db, async () => {
      await hold(karim, "2099-05-10", "2099-05-12");
      await expect(hold(sophie, "2099-05-12", "2099-05-14")).rejects.toMatchObject({ code: "23P01" });
    });
  });

  it("are cancelled once expired, when someone else books the same item", async () => {
    await asService(db, async () => {
      const abandoned = await hold(karim, "2099-05-10", "2099-05-12", PAST);
      await expect(hold(sophie, "2099-05-11", "2099-05-13")).resolves.toBeDefined();
      expect((await reservation(abandoned)).status).toBe("cancelled");
    });
  });

  it("no longer show as busy dates once expired", async () => {
    await db.query("begin");
    try {
      await db.query("set local role service_role");
      await hold(karim, "2099-06-10", "2099-06-11");
      await hold(karim, "2099-06-01", "2099-06-02", PAST); // expired, not yet cleaned up
      await db.query("reset role");
      await db.query("set local role anon");
      const { rows } = await db.query(
        "select starts_on::text from public.equipment_busy_dates($1, '2099-06-01', '2099-06-30')",
        [item],
      );
      expect(rows).toEqual([{ starts_on: "2099-06-10" }]);
    } finally {
      await db.query("rollback");
    }
  });

  it("can only be changed by the server", async () => {
    const { rows } = await db.query(
      `select p.proname, has_function_privilege('authenticated', p.oid, 'execute') as by_users,
              has_function_privilege('anon', p.oid, 'execute') as by_visitors,
              has_function_privilege('service_role', p.oid, 'execute') as by_server
         from pg_proc p
        where p.pronamespace = 'public'::regnamespace
          and p.proname in ('place_checkout_hold', 'confirm_reservation_payment', 'expire_checkout_hold',
                            'cancel_paid_reservation', 'record_refund', 'record_deposit')`,
    );
    expect(rows).toHaveLength(6);
    for (const row of rows) {
      expect(row, row.proname).toMatchObject({ by_users: false, by_visitors: false, by_server: true });
    }
  });

  it("cannot be placed by customers or visitors", async () => {
    await asUser(db, karim, async () => {
      await expect(hold(karim, "2099-07-01", "2099-07-02")).rejects.toMatchObject({ code: "42501" });
    });
    await asAnon(db, async () => {
      await expect(hold(karim, "2099-07-01", "2099-07-02")).rejects.toMatchObject({ code: "42501" });
    });
  });
});

describe("payment confirmation", () => {
  it("confirms once, even when Stripe delivers the event twice", async () => {
    await asService(db, async () => {
      const id = await hold(karim, "2099-08-01", "2099-08-03");
      await attachSession(id, "cs_test_a");
      expect(await confirm(id, "cs_test_a", "pi_test_a")).toBe("confirmed");
      expect(await confirm(id, "cs_test_a", "pi_test_a")).toBe("already_confirmed");
      const row = await reservation(id);
      expect(row).toMatchObject({ status: "confirmed", payment_intent_id: "pi_test_a", hold_expires_at: null });
      expect(await payments(id)).toEqual([{ kind: "rental", amount_cents: 16500, stripe_id: "pi_test_a" }]);
    });
  });

  it("changes nothing when the amount, currency or session do not match", async () => {
    await asService(db, async () => {
      const id = await hold(karim, "2099-08-10", "2099-08-12");
      await attachSession(id, "cs_test_b");
      expect(await confirm(id, "cs_test_b", "pi_test_b", 1)).toBe("mismatch");
      expect(await confirm(id, "cs_test_b", "pi_test_b", 16500, "usd")).toBe("mismatch");
      expect(await confirm(id, "cs_test_other", "pi_test_b")).toBe("mismatch");
      expect((await reservation(id)).status).toBe("pending_payment");
      expect(await payments(id)).toEqual([]);
    });
  });

  it("accepts a late payment if the dates are still free, and asks for a refund otherwise", async () => {
    await asService(db, async () => {
      const late = await hold(karim, "2099-09-01", "2099-09-03");
      await attachSession(late, "cs_test_late");
      await db.query("select public.expire_checkout_hold($1, 'cs_test_late')", [late]);
      expect(await confirm(late, "cs_test_late", "pi_test_late")).toBe("confirmed");

      const tooLate = await hold(karim, "2099-09-10", "2099-09-12");
      await attachSession(tooLate, "cs_test_too_late");
      await db.query("select public.expire_checkout_hold($1, 'cs_test_too_late')", [tooLate]);
      await hold(sophie, "2099-09-11", "2099-09-11");
      expect(await confirm(tooLate, "cs_test_too_late", "pi_test_too_late")).toBe("refund_needed");
      expect(await reservation(tooLate)).toMatchObject({ status: "cancelled", refund_due_cents: 16500 });
      expect(await payments(tooLate)).toHaveLength(1);
      // The same event again (Stripe retries, or the success page): still a refund, never "confirmed".
      expect(await confirm(tooLate, "cs_test_too_late", "pi_test_too_late")).toBe("refund_needed");
      expect(await confirm(late, "cs_test_late", "pi_test_late")).toBe("already_confirmed");
      expect(await payments(tooLate)).toHaveLength(1);
    });
  });
});

describe("cancellations and refunds", () => {
  it("release the item and record each refund once", async () => {
    await asService(db, async () => {
      const id = await hold(karim, "2099-10-01", "2099-10-03");
      await attachSession(id, "cs_test_c");
      await confirm(id, "cs_test_c", "pi_test_c");

      const { rows } = await db.query("select * from public.cancel_paid_reservation($1, $2, 16500)", [id, karim]);
      expect(rows).toEqual([{ payment_intent_id: "pi_test_c", refund_due_cents: 16500 }]);
      await expect(hold(sophie, "2099-10-01", "2099-10-03")).resolves.toBeDefined();

      const record = (refund: string, amount: number) =>
        db.query("select public.record_refund($1, $2, $3) as recorded", [id, refund, amount])
          .then((r) => r.rows[0].recorded);
      expect(await record("re_test_c1", 6500)).toBe(true);
      expect(await record("re_test_c1", 6500)).toBe(false); // the same refund, seen twice
      expect((await reservation(id)).refund_due_cents).toBe(10000);
      expect(await record("re_test_c2", 10000)).toBe(true);
      expect((await reservation(id)).refund_due_cents).toBe(0);
    });
  });

  it("are refused for another customer's reservation", async () => {
    await asService(db, async () => {
      const id = await hold(karim, "2099-10-10", "2099-10-11");
      await attachSession(id, "cs_test_d");
      await confirm(id, "cs_test_d", "pi_test_d");
      const { rows } = await db.query("select * from public.cancel_paid_reservation($1, $2, 16500)", [id, sophie]);
      expect(rows).toEqual([]);
      expect((await reservation(id)).status).toBe("confirmed");
    });
  });
});

describe("deposits", () => {
  it("are held once, then captured or released once", async () => {
    await asService(db, async () => {
      const id = await hold(karim, "2099-11-01", "2099-11-03");
      await attachSession(id, "cs_test_e");
      await confirm(id, "cs_test_e", "pi_test_e");
      const deposit = (kind: string, intent: string, amount: number) =>
        db.query("select public.record_deposit($1, $2, $3, $4) as ok", [id, kind, intent, amount])
          .then((r) => r.rows[0].ok);

      expect(await deposit("deposit_hold", "pi_dep_e", 40000)).toBe(false); // more than the deposit
      expect(await deposit("deposit_hold", "pi_dep_e", 30000)).toBe(true);
      expect(await deposit("deposit_hold", "pi_dep_e", 30000)).toBe(false);
      expect(await deposit("deposit_capture", "pi_dep_other", 5000)).toBe(false);
      expect(await deposit("deposit_capture", "pi_dep_e", 5000)).toBe(true);
      expect(await deposit("deposit_release", "pi_dep_e", 30000)).toBe(false);
      expect(await reservation(id)).toMatchObject({ status: "completed", deposit_status: "captured" });
    });
  });
});

describe("payment history", () => {
  it("is visible to its customer and to staff only, and read-only for everyone", async () => {
    let id = "";
    await db.query("begin");
    try {
      await db.query("set local role service_role");
      id = await hold(karim, "2099-12-01", "2099-12-02");
      await attachSession(id, "cs_test_f");
      await confirm(id, "cs_test_f", "pi_test_f");
      await db.query("reset role");

      const visibleTo = async (user: string) => {
        await db.query("set local role authenticated");
        await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: user, role: "authenticated" })]);
        const { rows } = await db.query("select stripe_id from public.payments where reservation_id = $1", [id]);
        await db.query("reset role");
        return rows.map((r) => r.stripe_id);
      };
      expect(await visibleTo(karim)).toEqual(["pi_test_f"]);
      expect(await visibleTo(sophie)).toEqual([]);
      expect(await visibleTo(staff)).toEqual(["pi_test_f"]);
    } finally {
      await db.query("rollback");
    }

    await asUser(db, karim, async () => {
      await expect(
        db.query(
          "insert into public.payments (reservation_id, customer_id, kind, amount_cents, currency, stripe_id) values ($1, $2, 'refund', 99999, 'eur', 're_fake')",
          [id, karim],
        ),
      ).rejects.toMatchObject({ code: "42501" });
    });
  });

  it("keeps Stripe identifiers and processed events away from the public API", async () => {
    await asUser(db, karim, async () => {
      await expect(db.query("select * from public.stripe_events")).rejects.toMatchObject({ code: "42501" });
    });
    await asUser(db, karim, async () => {
      await expect(
        db.query("update public.profiles set stripe_customer_id = 'cus_Fake1' where id = $1", [karim]),
      ).rejects.toMatchObject({ code: "42501" });
    });
  });
});
