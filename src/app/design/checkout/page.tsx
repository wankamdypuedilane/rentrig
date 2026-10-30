import type { Metadata } from "next";
import { ReservationCard } from "@/components/payments/reservation-card";
import type { ReservationRow } from "@/lib/reservations/queries";
import { BookingPreview } from "./preview";

// A static preview of the booking form and of reservations in every payment
// state, with sample data, for design reviews and end-to-end tests.
export const metadata: Metadata = { title: "Checkout preview", robots: { index: false } };

// Fixed dates, so that the preview and its tests do not depend on today's date.
const today = "2027-03-01";
const busy = [{ starts_on: "2027-03-10", ends_on: "2027-03-12" }];

const base = {
  rental_cents: 16500,
  deposit_cents: 30000,
  refund_due_cents: 0,
  equipment: { name: "Aluminium scaffold tower 6 m" },
  profiles: null,
} as const;

const samples: ReservationRow[] = [
  {
    ...base, id: "s1", starts_on: "2027-03-15", ends_on: "2027-03-17", status: "confirmed", deposit_status: "not_held",
    payments: [{ kind: "rental", amount_cents: 16500, created_at: "2027-03-01T10:00:00Z" }],
  },
  {
    ...base, id: "s2", starts_on: "2027-02-01", ends_on: "2027-02-03", status: "cancelled", deposit_status: "not_held",
    payments: [
      { kind: "rental", amount_cents: 16500, created_at: "2027-01-20T10:00:00Z" },
      { kind: "refund", amount_cents: 16500, created_at: "2027-01-25T10:00:00Z" },
    ],
  },
  {
    ...base, id: "s3", starts_on: "2027-01-10", ends_on: "2027-01-12", status: "completed", deposit_status: "captured",
    payments: [
      { kind: "rental", amount_cents: 16500, created_at: "2027-01-02T10:00:00Z" },
      { kind: "deposit_hold", amount_cents: 30000, created_at: "2027-01-10T08:00:00Z" },
      { kind: "deposit_capture", amount_cents: 4500, created_at: "2027-01-12T17:00:00Z" },
    ],
  },
];

export default function CheckoutPreviewPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-10 px-6 py-12">
      <section className="space-y-4">
        <h1 className="text-3xl font-bold">Aluminium scaffold tower 6 m</h1>
        <BookingPreview busy={busy} today={today} />
      </section>
      <section className="space-y-4">
        <h2 className="text-2xl font-bold">Reservations</h2>
        {samples.map((reservation) => (
          <ReservationCard key={reservation.id} reservation={reservation} />
        ))}
      </section>
    </main>
  );
}
