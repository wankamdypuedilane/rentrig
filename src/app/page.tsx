import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-6 px-6 py-24">
      <p className="text-sm font-medium text-primary">Harbor &amp; Hoist Equipment</p>
      <h1 className="max-w-2xl text-4xl font-bold sm:text-5xl">Professional equipment, reserved and paid online.</h1>
      <p className="max-w-xl text-lg text-muted-foreground">
        Check availability, pay the rental securely, and collect your equipment at the depot.
        The deposit is held on your card only while you have the equipment.
      </p>
      <div>
        <Button asChild size="lg">
          <Link href="/equipment">Browse equipment</Link>
        </Button>
      </div>
    </main>
  );
}
