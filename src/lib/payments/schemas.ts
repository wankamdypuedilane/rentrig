import { z } from "zod";
import { parseMoneyInput } from "./money";
import { rentalDays } from "./policy";

export const MAX_RENTAL_DAYS = 90;

/** What the booking form sends: ids and dates, never a price. */
export const checkoutSchema = z
  .object({
    equipmentId: z.uuid(),
    startsOn: z.iso.date("Choose a start date."),
    endsOn: z.iso.date("Choose a return date."),
  })
  .refine((d) => d.endsOn >= d.startsOn, {
    path: ["endsOn"],
    message: "The return date must be on or after the start date.",
  })
  .refine((d) => rentalDays(d.startsOn, d.endsOn) <= MAX_RENTAL_DAYS, {
    path: ["endsOn"],
    message: `Rentals last at most ${MAX_RENTAL_DAYS} days.`,
  });

/** Reservation and equipment ids are uuids. */
export const idSchema = z.uuid();

/** Staff enter the amount kept from the deposit, as typed money ("45.50"). */
export const depositCaptureSchema = z.object({
  reservationId: z.uuid(),
  amount: z
    .string()
    .transform((text) => parseMoneyInput(text))
    .pipe(z.number({ error: "Enter an amount such as 45.50." }).int().positive("Enter an amount above zero.")),
});
