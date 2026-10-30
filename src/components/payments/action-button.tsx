"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";

export type ActionState = { status: "idle" | "done" | "error"; message?: string };

type ActionButtonProps = {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  fields: Record<string, string>;
  label: string;
  pendingLabel: string;
  variant?: "default" | "outline" | "destructive";
  /** An optional amount field (deposit capture). */
  amountLabel?: string;
};

// A small form that runs one Server Action and shows its message.
export function ActionButton({ action, fields, label, pendingLabel, variant = "outline", amountLabel }: ActionButtonProps) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" });
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {amountLabel && (
        <label className="grid gap-1 text-sm">
          <span>{amountLabel}</span>
          <input name="amount" inputMode="decimal" required placeholder="45.00"
            className="h-9 w-28 rounded-md border border-input bg-background px-3" />
        </label>
      )}
      <Button type="submit" variant={variant} size="sm" disabled={pending}>
        {pending ? pendingLabel : label}
      </Button>
      <p aria-live="polite" className={state.status === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
        {state.message}
      </p>
    </form>
  );
}
