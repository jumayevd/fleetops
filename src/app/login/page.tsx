import { redirect } from "next/navigation";
import { Truck } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { homeFor } from "@/lib/permissions";
import { ThemeToggle } from "@/components/theme-toggle";
import { LoginForm } from "./login-form";
import { Signal, SignalGrid } from "./signal";

export const metadata = { title: "Sign in" };

const DEMO_ACCOUNTS = [
  { role: "Owner", email: "owner@demo.local" },
  { role: "Admin", email: "admin@demo.local" },
  { role: "Dispatcher", email: "dispatch@demo.local" },
  { role: "Fleet manager", email: "fleet@demo.local" },
  { role: "Accountant", email: "accounting@demo.local" },
  { role: "Driver", email: "driver@demo.local" },
];

function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-on-primary">
        <Truck className="h-4 w-4" />
      </span>
      <span className="text-[15px] font-semibold tracking-tight text-fg">FleetOps</span>
      <span className="eyebrow mt-px">TMS</span>
    </div>
  );
}

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(homeFor(user.role));
  const demo = process.env.DEMO_MODE === "true";
  const year = new Date().getFullYear();

  return (
    <main className="relative grid min-h-dvh bg-canvas lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="absolute right-4 top-4 z-20">
        <ThemeToggle showLabel className="h-8 border border-line bg-surface px-2" />
      </div>

      {/* Product statement */}
      <section className="relative hidden flex-col justify-between overflow-hidden border-r border-line bg-surface p-10 lg:flex xl:p-14">
        <SignalGrid />
        <div className="relative z-10"><Wordmark /></div>
        <div className="relative z-10 max-w-xl">
          <p className="eyebrow mb-3">Dispatch · Tracking · Fleet · Billing</p>
          <h1 className="text-[32px] font-semibold leading-[1.15] tracking-tight text-fg xl:text-[36px]">
            Every truck, load and dollar, in one control room.
          </h1>
          <p className="mt-4 max-w-md text-[14px] leading-6 text-fg-muted">
            Boards, live map, maintenance, documents and invoices share one record of each load, so dispatch,
            fleet and accounting see the same truth and act on it sooner.
          </p>
          <Signal />
        </div>
        <p className="relative z-10 text-[11px] text-fg-subtle">© {year} FleetOps · Day and night themes · Keyboard first</p>
      </section>

      {/* Sign-in form */}
      <section className="flex items-center justify-center px-5 py-14 sm:px-8">
        <div className="w-full max-w-[360px]">
          <div className="mb-8 lg:hidden"><Wordmark /></div>
          <h2 className="text-lg font-semibold tracking-tight text-fg">Sign in</h2>
          <p className="mt-1 text-[13px] text-fg-muted">Use your company account. Sessions last 12 hours.</p>
          <LoginForm demoAccounts={demo ? DEMO_ACCOUNTS : []} />
        </div>
      </section>
    </main>
  );
}
