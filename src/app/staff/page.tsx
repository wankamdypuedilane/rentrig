import type { Metadata } from "next";
import { Suspense } from "react";
import { ActionButton } from "@/components/payments/action-button";
import { ReservationCard } from "@/components/payments/reservation-card";
import { Skeleton } from "@/components/ui/skeleton";
import { requireRole } from "@/lib/auth/current-user";
import { formatMoney } from "@/lib/payments/money";
import { getDepotReservations } from "@/lib/reservations/queries";
import { captureDepositAction, holdDepositAction, releaseDepositAction } from "./actions";

export const metadata: Metadata = { title: "Depot", robots: { index: false } };

export default function StaffPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-6 px-6 py-12">
      <h1 className="text-3xl font-bold">Depot: handovers and returns</h1>
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <Depot />
      </Suspense>
    </main>
  );
}

async function Depot() {
  await requireRole("/staff", ["staff"]);
  const reservations = await getDepotReservations();
  if (reservations.length === 0) return <p className="text-muted-foreground">No confirmed reservations.</p>;
  return (
    <div className="space-y-4">
      {reservations.map((r) => (
        <ReservationCard key={r.id} reservation={r}>
          {r.deposit_status === "not_held" && (
            <ActionButton action={holdDepositAction} fields={{ reservationId: r.id }}
              label={`Hand over: hold ${formatMoney(r.deposit_cents)}`} pendingLabel="Holding…" variant="default" />
          )}
          {r.deposit_status === "held" && (
            <div className="space-y-3">
              <ActionButton action={releaseDepositAction} fields={{ reservationId: r.id }}
                label="Returned OK: release deposit" pendingLabel="Releasing…" variant="default" />
              <ActionButton action={captureDepositAction} fields={{ reservationId: r.id }}
                label="Keep this amount" pendingLabel="Capturing…" amountLabel="Amount kept (EUR)" />
            </div>
          )}
        </ReservationCard>
      ))}
    </div>
  );
}
