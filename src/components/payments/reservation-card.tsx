import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/payments/money";
import type { PaymentLine, ReservationRow } from "@/lib/reservations/queries";

const statusLabels: Record<ReservationRow["status"], { label: string; variant: "success" | "secondary" | "outline" | "warning" }> = {
  pending_payment: { label: "Awaiting payment", variant: "warning" },
  confirmed: { label: "Confirmed", variant: "success" },
  cancelled: { label: "Cancelled", variant: "secondary" },
  completed: { label: "Completed", variant: "outline" },
};

const paymentLabels: Record<PaymentLine["kind"], string> = {
  rental: "Rental paid",
  refund: "Refund",
  deposit_hold: "Deposit held",
  deposit_release: "Deposit released",
  deposit_capture: "Deposit kept",
};

const dateFormat = new Intl.DateTimeFormat("en-IE", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const formatDate = (isoDate: string) => dateFormat.format(new Date(`${isoDate}T00:00:00Z`));

export function ReservationCard({ reservation, children }: { reservation: ReservationRow; children?: ReactNode }) {
  const status = statusLabels[reservation.status];
  return (
    <article className="space-y-4 rounded-xl border bg-card p-5 text-card-foreground" aria-labelledby={`r-${reservation.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id={`r-${reservation.id}`} className="text-lg font-semibold">
            {reservation.equipment?.name ?? "Equipment"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {formatDate(reservation.starts_on)} – {formatDate(reservation.ends_on)}
            {reservation.profiles && ` · ${reservation.profiles.company_name ?? reservation.profiles.full_name}`}
          </p>
        </div>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>

      {reservation.payments.length > 0 && (
        <table className="w-full text-sm">
          <caption className="sr-only">Payment history</caption>
          <tbody>
            {reservation.payments.map((line, index) => (
              <tr key={index} className="border-t">
                <th scope="row" className="py-1.5 text-left font-normal text-muted-foreground">
                  {paymentLabels[line.kind]}
                </th>
                <td className="py-1.5 text-right tabular-nums">
                  {line.kind === "refund" ? "−" : ""}
                  {formatMoney(line.amount_cents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {reservation.refund_due_cents > 0 && (
        <p className="text-sm text-muted-foreground">
          Refund of {formatMoney(reservation.refund_due_cents)} in progress.
        </p>
      )}
      {children}
    </article>
  );
}
