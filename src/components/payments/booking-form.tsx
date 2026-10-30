"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import type { CheckoutState } from "@/app/equipment/[id]/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatMoney } from "@/lib/payments/money";
import { rentalDays } from "@/lib/payments/policy";
import { MAX_RENTAL_DAYS } from "@/lib/payments/schemas";
import { quoteRental } from "@/lib/pricing";

type Range = { starts_on: string; ends_on: string };

type BookingFormProps = {
  equipmentId: string;
  dailyPriceCents: number;
  depositCents: number;
  busy: Range[];
  today: string;
  signedIn: boolean;
  action: (state: CheckoutState, formData: FormData) => Promise<CheckoutState>;
};

const overlaps = (a: Range, b: Range) => a.starts_on <= b.ends_on && b.starts_on <= a.ends_on;

export function BookingForm({ equipmentId, dailyPriceCents, depositCents, busy, today, signedIn, action }: BookingFormProps) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");

  const days = startsOn && endsOn && endsOn >= startsOn ? rentalDays(startsOn, endsOn) : 0;
  const tooLong = days > MAX_RENTAL_DAYS;
  // The quote is only a preview: the server recomputes the price at checkout.
  const quote = days >= 1 && !tooLong ? quoteRental({ dailyPriceCents, depositCents, days }) : null;
  const clash = days >= 1 && busy.some((range) => overlaps(range, { starts_on: startsOn, ends_on: endsOn }));

  return (
    <form action={formAction} className="space-y-5 rounded-xl border bg-card p-5 text-card-foreground" noValidate>
      <input type="hidden" name="equipmentId" value={equipmentId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="startsOn">Start date</Label>
          <Input id="startsOn" name="startsOn" type="date" min={today} required value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)} aria-invalid={Boolean(state.fieldErrors?.startsOn)} />
          {state.fieldErrors?.startsOn && <p className="text-sm text-destructive">{state.fieldErrors.startsOn[0]}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="endsOn">Return date</Label>
          <Input id="endsOn" name="endsOn" type="date" min={startsOn || today} required value={endsOn}
            onChange={(e) => setEndsOn(e.target.value)} aria-invalid={Boolean(state.fieldErrors?.endsOn)} />
          {state.fieldErrors?.endsOn && <p className="text-sm text-destructive">{state.fieldErrors.endsOn[0]}</p>}
        </div>
      </div>

      <div aria-live="polite" className="space-y-1 text-sm">
        {quote && !clash && (
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
            <dt className="text-muted-foreground">
              Rental, {days} {days === 1 ? "day" : "days"}
            </dt>
            <dd className="text-right font-medium" data-testid="quote-rental">{formatMoney(quote.rentalCents)}</dd>
            <dt className="text-muted-foreground">Deposit, held at handover</dt>
            <dd className="text-right">{formatMoney(quote.depositCents)}</dd>
          </dl>
        )}
        {tooLong && <p className="text-destructive">Rentals last at most {MAX_RENTAL_DAYS} days.</p>}
        {clash && <p className="text-destructive">The item is already booked on some of these dates.</p>}
      </div>

      {state.message && (
        <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.message}
        </p>
      )}

      {signedIn ? (
        <Button type="submit" className="w-full" disabled={pending || !quote || clash}>
          {pending ? "Opening secure payment…" : "Continue to payment"}
        </Button>
      ) : (
        <Button asChild className="w-full">
          <Link href={`/sign-in?next=${encodeURIComponent(`/equipment/${equipmentId}`)}`}>Sign in to reserve</Link>
        </Button>
      )}
      <p className="text-xs text-muted-foreground">
        You pay the rental now on Stripe&apos;s secure page. Free cancellation up to two days before the start date.
      </p>
    </form>
  );
}
