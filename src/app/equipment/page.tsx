import type { Metadata } from "next";
import Link from "next/link";
import { getActiveEquipment } from "@/lib/catalog/queries";
import { formatMoney } from "@/lib/payments/money";

export const metadata: Metadata = { title: "Equipment" };

export default async function EquipmentPage() {
  // Public, cached data: no request-time API here, so no Suspense boundary is needed.
  const items = await getActiveEquipment();
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 space-y-6 px-6 py-12">
      <h1 className="text-3xl font-bold">Equipment</h1>
      <ul className="grid gap-4 sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.id} className="rounded-xl border bg-card p-5 text-card-foreground">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.equipment_categories?.name}</p>
            <h2 className="text-lg font-semibold">
              <Link href={`/equipment/${item.id}`} className="hover:underline">{item.name}</Link>
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>
            <p className="mt-3 text-sm">
              <span className="font-semibold">{formatMoney(item.daily_price_cents)}</span> per day ·
              deposit {formatMoney(item.deposit_cents)}
            </p>
          </li>
        ))}
      </ul>
    </main>
  );
}
