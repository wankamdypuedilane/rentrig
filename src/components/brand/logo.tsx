import { cn } from "@/lib/utils";

type LogoProps = {
  className?: string;
  /** Show the "RentRig" wordmark next to the symbol. */
  withWordmark?: boolean;
};

// The RentRig mark: a hoist hook under a beam. Colours come from design
// tokens, so the logo adapts to dark mode.
export function Logo({ className, withWordmark = true }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" role="img" aria-label="RentRig">
        <rect x="3" y="3" width="26" height="5" rx="1.5" fill="var(--foreground)" />
        <path d="M16 8v8" stroke="var(--foreground)" strokeWidth="3" strokeLinecap="round" />
        <path
          d="M16 16a6 6 0 1 1-6 6"
          fill="none"
          stroke="var(--primary)"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
      </svg>
      {withWordmark && (
        <span aria-hidden="true" className="text-xl font-bold tracking-tight">
          RentRig
        </span>
      )}
    </span>
  );
}
