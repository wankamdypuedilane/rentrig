"use server";

import { refresh } from "next/cache";
import type { ActionState } from "@/components/payments/action-button";
import { requireUser } from "@/lib/auth/current-user";
import { issueDueRefund } from "@/lib/payments/operations";
import { refundForCancellation } from "@/lib/payments/policy";
import { idSchema } from "@/lib/payments/schemas";
import { cancelPaidReservation } from "@/lib/payments/store";
import { createClient } from "@/lib/supabase/server";

export async function cancelReservation(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser("/reservations");
  const parsed = idSchema.safeParse(formData.get("reservationId"));
  if (!parsed.success) return { status: "error", message: "Invalid request." };

  // Read with the user's own client: Row Level Security returns only their rows.
  const supabase = await createClient();
  const { data: reservation } = await supabase
    .from("reservations")
    .select("id, starts_on, rental_cents, status")
    .eq("id", parsed.data)
    .maybeSingle<{ id: string; starts_on: string; rental_cents: number; status: string }>();
  if (!reservation || reservation.status !== "confirmed") {
    return { status: "error", message: "This reservation cannot be cancelled." };
  }

  const refund = refundForCancellation({
    startsOn: reservation.starts_on,
    rentalCents: reservation.rental_cents,
    now: new Date(),
  });
  if (!refund.allowed) {
    return { status: "error", message: "The rental has started: please call the depot." };
  }

  // Cancel first (the item is free at once), then refund. If the refund call
  // fails, refund_due_cents remains and the next attempt finishes the job.
  const cancelled = await cancelPaidReservation(reservation.id, user.id, refund.refundCents);
  if (!cancelled) return { status: "error", message: "This reservation cannot be cancelled." };
  try {
    await issueDueRefund(reservation.id);
  } catch (error) {
    console.error("[stripe] refund failed, will be retried", error);
  }
  refresh();
  return { status: "done", message: "Reservation cancelled." };
}

/** Retries a refund that is still due (for example after a network error). */
export async function retryRefund(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser("/reservations");
  const parsed = idSchema.safeParse(formData.get("reservationId"));
  if (!parsed.success) return { status: "error", message: "Invalid request." };
  const supabase = await createClient();
  const { data } = await supabase.from("reservations").select("id").eq("id", parsed.data).maybeSingle();
  if (!data) return { status: "error", message: "Invalid request." };
  try {
    await issueDueRefund(parsed.data);
  } catch {
    return { status: "error", message: "The refund could not be sent. Please try again later." };
  }
  refresh();
  return { status: "done", message: "Refund sent." };
}
