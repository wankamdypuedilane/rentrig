import "server-only";
import { createClient } from "@/lib/supabase/server";

export type PaymentLine = {
  kind: "rental" | "refund" | "deposit_hold" | "deposit_release" | "deposit_capture";
  amount_cents: number;
  created_at: string;
};

export type ReservationRow = {
  id: string;
  starts_on: string;
  ends_on: string;
  status: "pending_payment" | "confirmed" | "cancelled" | "completed";
  rental_cents: number;
  deposit_cents: number;
  refund_due_cents: number;
  deposit_status: "not_held" | "held" | "released" | "captured";
  equipment: { name: string } | null;
  profiles: { full_name: string; company_name: string | null } | null;
  payments: PaymentLine[];
};

const columns =
  "id, starts_on, ends_on, status, rental_cents, deposit_cents, refund_due_cents, deposit_status, " +
  "equipment(name), profiles(full_name, company_name), payments(kind, amount_cents, created_at)";

/** The signed-in customer's reservations. Row Level Security limits them to their own. */
export async function getMyReservations(userId: string): Promise<ReservationRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reservations")
    .select(columns)
    .eq("customer_id", userId)
    .neq("status", "pending_payment")
    .order("starts_on", { ascending: false })
    .order("created_at", { referencedTable: "payments" })
    .overrideTypes<ReservationRow[], { merge: false }>();
  if (error) throw new Error("Could not load your reservations");
  return data;
}

/** Depot view: confirmed reservations, soonest first. Staff read all rows (policy of chapter 10). */
export async function getDepotReservations(): Promise<ReservationRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reservations")
    .select(columns)
    .eq("status", "confirmed")
    .order("starts_on")
    .limit(50)
    .overrideTypes<ReservationRow[], { merge: false }>();
  if (error) throw new Error("Could not load reservations");
  return data;
}
