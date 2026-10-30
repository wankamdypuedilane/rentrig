"use client";

import { BookingForm } from "@/components/payments/booking-form";

// The form submits to an in-memory action: no database, no Stripe, no account.
export function BookingPreview(props: { busy: { starts_on: string; ends_on: string }[]; today: string }) {
  return (
    <BookingForm
      equipmentId="00000000-0000-4000-8000-0000000000e1"
      dailyPriceCents={5500}
      depositCents={30000}
      signedIn
      action={async (_state, formData) => ({
        status: "error",
        message: `Preview: Stripe Checkout would open for ${formData.get("startsOn")} to ${formData.get("endsOn")}.`,
      })}
      {...props}
    />
  );
}
