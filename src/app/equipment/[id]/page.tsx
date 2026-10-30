import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { BookingForm } from "@/components/payments/booking-form";
import { Skeleton } from "@/components/ui/skeleton";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getBusyDates, getEquipment } from "@/lib/catalog/queries";
import { formatMoney } from "@/lib/payments/money";
import { idSchema } from "@/lib/payments/schemas";
import { startCheckout } from "./actions";

export default function EquipmentDetailPage({ params }: PageProps<"/equipment/[id]">) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <Detail params={params} />
      </Suspense>
    </main>
  );
}

async function Detail({ params }: { params: PageProps<"/equipment/[id]">["params"] }) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound(); // ids are uuids
  const item = await getEquipment(id);
  if (!item) notFound();
  // Availability and the visitor's session are request-time data.
  const [user, { today, busy }] = await Promise.all([getCurrentUser(), getBusyDates(id)]);

  return (
    <div className="space-y-8">
      <div className="space-y-2">
        <Link href="/equipment" className="text-sm text-muted-foreground hover:text-foreground">← All equipment</Link>
        <h1 className="text-3xl font-bold">{item.name}</h1>
        <p className="text-muted-foreground">{item.description}</p>
        <p>
          <span className="font-semibold">{formatMoney(item.daily_price_cents)}</span> per day, five days charged
          per full week · deposit {formatMoney(item.deposit_cents)}
        </p>
      </div>
      <BookingForm
        equipmentId={item.id}
        dailyPriceCents={item.daily_price_cents}
        depositCents={item.deposit_cents}
        busy={busy}
        today={today}
        signedIn={user !== null}
        action={startCheckout}
      />
    </div>
  );
}
