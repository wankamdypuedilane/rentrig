import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { requireUser } from "@/lib/auth/current-user";
import { webhookDeps } from "@/lib/payments/operations";
import { getStripe, hasStripe } from "@/lib/payments/stripe";
import { fulfilCheckout } from "@/lib/payments/webhook";

export const metadata: Metadata = { title: "Payment received", robots: { index: false } };

export default function CheckoutSuccessPage({ searchParams }: PageProps<"/checkout/success">) {
  return (
    <main className="mx-auto w-full max-w-xl flex-1 space-y-6 px-6 py-16">
      <Suspense fallback={<Skeleton className="h-40 w-full" />}>
        <Outcome searchParams={searchParams} />
      </Suspense>
      <Button asChild variant="outline">
        <Link href="/reservations">See my reservations</Link>
      </Button>
    </main>
  );
}

async function Outcome({ searchParams }: { searchParams: PageProps<"/checkout/success">["searchParams"] }) {
  await requireUser("/reservations");
  const { session_id: sessionId } = await searchParams;
  if (typeof sessionId !== "string" || !sessionId.startsWith("cs_") || !hasStripe) {
    return <Message title="We could not find this payment" text="Check your reservations below." />;
  }

  // Stripe recommends fulfilling here too: the customer may arrive before the
  // webhook. The same idempotent function runs; whichever is second finds it done.
  const session = await getStripe().checkout.sessions.retrieve(sessionId);
  const outcome = await fulfilCheckout(session, webhookDeps);

  if (outcome === "confirmed" || outcome === "already_confirmed") {
    return <Message title="Your reservation is confirmed" text="Bring a photo ID when you collect the equipment. The deposit is held on your card at the depot." />;
  }
  if (outcome === "refund_needed") {
    return <Message title="These dates were taken" text="Your payment arrived after the hold expired and someone else booked the dates. We are refunding you in full: banks usually show it within 5 to 10 business days." />;
  }
  return <Message title="Payment not completed" text="Your card was not charged. You can try again from the equipment page." />;
}

function Message({ title, text }: { title: string; text: string }) {
  return (
    <div className="space-y-2" role="status">
      <h1 className="text-3xl font-bold">{title}</h1>
      <p className="text-muted-foreground">{text}</p>
    </div>
  );
}
