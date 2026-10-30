import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionButton } from "@/components/payments/action-button";
import { ReservationCard } from "@/components/payments/reservation-card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/current-user";
import { getMyReservations } from "@/lib/reservations/queries";
import { cancelReservation, retryRefund } from "./actions";

export const metadata: Metadata = { title: "My reservations", robots: { index: false } };

export default function ReservationsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-6 py-12">
      <h1 className="text-3xl font-bold">My reservations</h1>
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <List />
      </Suspense>
    </main>
  );
}

async function List() {
  const user = await requireUser("/reservations");
  const reservations = await getMyReservations(user.id);
  if (reservations.length === 0) {
    return (
      <p className="text-muted-foreground">
        No reservations yet. <Link href="/equipment" className="text-primary hover:underline">Browse equipment</Link>
      </p>
    );
  }
  return (
    <div className="space-y-4">
      {reservations.map((reservation) => (
        <ReservationCard key={reservation.id} reservation={reservation}>
          {reservation.status === "confirmed" && reservation.deposit_status === "not_held" && (
            <ActionButton action={cancelReservation} fields={{ reservationId: reservation.id }}
              label="Cancel reservation" pendingLabel="Cancelling…" variant="destructive" />
          )}
          {reservation.refund_due_cents > 0 && (
            <ActionButton action={retryRefund} fields={{ reservationId: reservation.id }}
              label="Send refund again" pendingLabel="Sending…" />
          )}
        </ReservationCard>
      ))}
    </div>
  );
}
