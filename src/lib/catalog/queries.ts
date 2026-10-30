import { cacheLife, cacheTag } from "next/cache";
import { connection } from "next/server";
import { depotDate } from "@/lib/payments/policy";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createPublicClient } from "@/lib/supabase/public";

export type Equipment = {
  id: string;
  name: string;
  description: string;
  daily_price_cents: number;
  deposit_cents: number;
  equipment_categories: { name: string } | null;
};

const columns = "id, name, description, daily_price_cents, deposit_cents, equipment_categories(name)";

/** The public catalogue. Cached: identical for every visitor. */
export async function getActiveEquipment(): Promise<Equipment[]> {
  "use cache";
  cacheLife("minutes");
  cacheTag("catalog");

  if (!hasSupabaseEnv) return [];
  const { data, error } = await createPublicClient()
    .from("equipment")
    .select(columns)
    .order("name")
    .overrideTypes<Equipment[], { merge: false }>();
  if (error) throw new Error("Could not load the catalogue");
  return data;
}

/** One active item, or null. Prices are read here, on the server, at checkout too. */
export async function getEquipment(id: string): Promise<Equipment | null> {
  "use cache";
  cacheLife("minutes");
  cacheTag("catalog", `equipment:${id}`);

  if (!hasSupabaseEnv) return null;
  const { data } = await createPublicClient()
    .from("equipment")
    .select(columns)
    .eq("id", id)
    .maybeSingle<Equipment>();
  return data;
}

export type BusyRange = { starts_on: string; ends_on: string };

/** Busy dates for the next six months. Not cached: they change with every booking. */
export async function getBusyDates(equipmentId: string): Promise<{ today: string; busy: BusyRange[] }> {
  await connection();
  const today = depotDate(new Date());
  if (!hasSupabaseEnv) return { today, busy: [] };
  const until = new Date(Date.parse(`${today}T00:00:00Z`) + 183 * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await createPublicClient().rpc("equipment_busy_dates", {
    item: equipmentId,
    from_date: today,
    to_date: until,
  });
  if (error) throw new Error("Could not load availability");
  return { today, busy: (data ?? []) as BusyRange[] };
}
