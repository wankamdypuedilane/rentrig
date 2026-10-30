import { expect, test } from "@playwright/test";

// The checkout preview uses fixed sample data: a scaffold tower at 55.00 a day,
// a 300.00 deposit, already booked from 10 to 12 March 2027.

test("previews the price and refuses busy dates before any payment", async ({ page }) => {
  await page.goto("/design/checkout");
  await page.getByLabel("Start date").fill("2027-03-15");
  await page.getByLabel("Return date").fill("2027-03-17");
  await expect(page.getByTestId("quote-rental")).toHaveText("€165.00");
  await expect(page.getByText("Deposit, held at handover")).toBeVisible();

  await page.getByLabel("Start date").fill("2027-03-11");
  await expect(page.getByText("The item is already booked on some of these dates.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue to payment" })).toBeDisabled();
});

test("submits ids and dates to the server action", async ({ page }) => {
  await page.goto("/design/checkout");
  await page.getByLabel("Start date").fill("2027-03-15");
  await page.getByLabel("Return date").fill("2027-03-16");
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Preview" })).toHaveText("Preview: Stripe Checkout would open for 2027-03-15 to 2027-03-16.");
});

test("shows the payment history of each reservation", async ({ page }) => {
  await page.goto("/design/checkout");
  const cancelled = page.getByRole("article").filter({ hasText: "Cancelled" });
  await expect(cancelled.getByRole("row", { name: /Refund/ })).toContainText("−€165.00");
  const completed = page.getByRole("article").filter({ hasText: "Completed" });
  await expect(completed.getByRole("row", { name: /Deposit kept/ })).toContainText("€45.00");
});

test("fits a 375-pixel phone screen without horizontal scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto("/design/checkout");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
