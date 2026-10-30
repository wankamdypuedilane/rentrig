import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BookingForm } from "@/components/payments/booking-form";

const props = {
  equipmentId: "00000000-0000-4000-8000-0000000000e1",
  dailyPriceCents: 5500,
  depositCents: 30000,
  busy: [{ starts_on: "2027-03-10", ends_on: "2027-03-12" }],
  today: "2027-03-01",
  signedIn: true,
};

async function chooseDates(start: string, end: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Start date"), start);
  await user.type(screen.getByLabelText("Return date"), end);
  return user;
}

describe("BookingForm", () => {
  it("previews the price with the weekly rate and the deposit", async () => {
    render(<BookingForm {...props} action={vi.fn()} />);
    await chooseDates("2027-03-15", "2027-03-22"); // 8 days: one week (5 days) + 1 day
    expect(screen.getByText("Rental, 8 days")).toBeInTheDocument();
    expect(screen.getByTestId("quote-rental")).toHaveTextContent("€330.00");
    expect(screen.getByText("€300.00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue to payment" })).toBeEnabled();
  });

  it("warns about busy dates and does not submit them", async () => {
    render(<BookingForm {...props} action={vi.fn()} />);
    await chooseDates("2027-03-12", "2027-03-14");
    expect(screen.getByText(/already booked on some of these dates/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue to payment" })).toBeDisabled();
  });

  it("sends ids and dates only, and shows the server's answer", async () => {
    const action = vi.fn(async () => ({ status: "error" as const, message: "Someone booked these dates a moment ago." }));
    render(<BookingForm {...props} action={action} />);
    const user = await chooseDates("2027-03-15", "2027-03-16");
    await user.click(screen.getByRole("button", { name: "Continue to payment" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Someone booked these dates");
    const sent = Object.fromEntries((action.mock.calls[0] as unknown as [unknown, FormData])[1]);
    expect(sent).toEqual({ equipmentId: props.equipmentId, startsOn: "2027-03-15", endsOn: "2027-03-16" });
  });

  it("asks visitors to sign in instead of paying", () => {
    render(<BookingForm {...props} signedIn={false} action={vi.fn()} />);
    expect(screen.getByRole("link", { name: "Sign in to reserve" })).toHaveAttribute(
      "href",
      `/sign-in?next=${encodeURIComponent(`/equipment/${props.equipmentId}`)}`,
    );
  });
});
