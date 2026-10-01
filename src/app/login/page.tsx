import { redirect } from "next/navigation";
import { Truck } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { homeFor } from "@/lib/permissions";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

const DEMO_ACCOUNTS = [
  { role: "Owner", email: "owner@demo.local" },
  { role: "Admin", email: "admin@demo.local" },
  { role: "Dispatcher", email: "dispatch@demo.local" },
  { role: "Fleet manager", email: "fleet@demo.local" },
  { role: "Accountant", email: "accounting@demo.local" },
  { role: "Driver", email: "driver@demo.local" },
];

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(homeFor(user.role));
  const demo = process.env.DEMO_MODE === "true";

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden overflow-hidden bg-slate-900 lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,#2563eb55,transparent_50%),radial-gradient(circle_at_80%_80%,#7c3aed44,transparent_50%)]" />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-2 text-lg font-semibold"><Truck className="h-6 w-6 text-blue-400" /> FleetOps</div>
          <div>
            <h1 className="text-4xl font-semibold leading-tight">Every truck, load and dollar —<br />in one control tower.</h1>
            <p className="mt-4 max-w-md text-slate-300">Dispatch loads, track your fleet live, manage drivers and maintenance, and get paid faster.</p>
          </div>
          <p className="text-xs text-slate-500">© {new Date().getFullYear()} FleetOps</p>
        </div>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h2 className="text-2xl font-semibold text-slate-900">Sign in</h2>
          <p className="mt-1 text-sm text-slate-500">Use your company account.</p>
          <LoginForm demoAccounts={demo ? DEMO_ACCOUNTS : []} />
        </div>
      </div>
    </div>
  );
}
