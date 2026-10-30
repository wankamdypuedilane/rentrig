"use server";

import { refresh } from "next/cache";
import type { ActionState } from "@/components/payments/action-button";
import { requireRole } from "@/lib/auth/current-user";
import { captureDeposit, holdDeposit, releaseDeposit } from "@/lib/payments/operations";
import { depositCaptureSchema, idSchema } from "@/lib/payments/schemas";

async function run(work: () => Promise<{ ok: true } | { ok: false; message: string }>, done: string): Promise<ActionState> {
  try {
    const result = await work();
    if (!result.ok) return { status: "error", message: result.message };
  } catch (error) {
    console.error("[stripe] deposit operation failed", error);
    return { status: "error", message: "Stripe did not answer. Please try again." };
  }
  refresh();
  return { status: "done", message: done };
}

export async function holdDepositAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole("/staff", ["staff"]);
  const id = idSchema.safeParse(formData.get("reservationId"));
  if (!id.success) return { status: "error", message: "Invalid request." };
  return run(() => holdDeposit(id.data), "Deposit held.");
}

export async function releaseDepositAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole("/staff", ["staff"]);
  const id = idSchema.safeParse(formData.get("reservationId"));
  if (!id.success) return { status: "error", message: "Invalid request." };
  return run(() => releaseDeposit(id.data), "Deposit released.");
}

export async function captureDepositAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireRole("/staff", ["staff"]);
  const parsed = depositCaptureSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { status: "error", message: "Enter an amount such as 45.50." };
  return run(() => captureDeposit(parsed.data.reservationId, parsed.data.amount), "Amount kept; the rest is released.");
}
