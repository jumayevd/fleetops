"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import clsx from "clsx";
import {
  LayoutDashboard, Package, Map, Truck, Wrench, Users, Building2, Receipt, BarChart3, ShieldCheck,
  ScrollText, Send, LogOut, Menu, X, Bell, Navigation, UserCircle,
} from "lucide-react";
import { can, type Permission } from "@/lib/permissions";
import { ROLE_LABELS, type Role } from "@/lib/constants";
import { logout } from "@/app/actions/auth";
import type { Alert } from "@/lib/alerts";

const NAV: { section: string; items: { href: string; label: string; icon: typeof Package; perm: Permission }[] }[] = [
  {
    section: "Operations",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, perm: "dashboard.view" },
      { href: "/loads", label: "Loads & Dispatch", icon: Package, perm: "loads.view" },
      { href: "/tracking", label: "Live Tracking", icon: Map, perm: "tracking.view" },
      { href: "/driver", label: "My Loads", icon: Navigation, perm: "driver.portal" },
    ],
  },
  {
    section: "Assets",
    items: [
      { href: "/fleet", label: "Fleet", icon: Truck, perm: "fleet.view" },
      { href: "/maintenance", label: "Maintenance", icon: Wrench, perm: "fleet.view" },
      { href: "/drivers", label: "Drivers", icon: Users, perm: "drivers.view" },
    ],
  },
  {
    section: "Business",
    items: [
      { href: "/customers", label: "Customers", icon: Building2, perm: "customers.view" },
      { href: "/finance", label: "Finance", icon: Receipt, perm: "finance.view" },
      { href: "/reports", label: "Reports", icon: BarChart3, perm: "reports.view" },
    ],
  },
  {
    section: "Admin",
    items: [
      { href: "/admin/users", label: "Users & Roles", icon: ShieldCheck, perm: "users.manage" },
      { href: "/admin/telegram", label: "Telegram Alerts", icon: Send, perm: "users.manage" },
      { href: "/admin/audit", label: "Audit Log", icon: ScrollText, perm: "audit.view" },
    ],
  },
];

export function AppShell({ user, alerts, children }: {
  user: { name: string; email: string; role: string }; alerts: Alert[]; children: ReactNode;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [bell, setBell] = useState(false);
  const critical = alerts.filter((a) => a.level === "critical").length;

  const sidebar = (
    <nav className="flex h-full flex-col bg-slate-900 text-slate-300">
      <div className="flex h-16 items-center gap-2 px-5 text-white">
        <div className="rounded-lg bg-blue-600 p-1.5"><Truck className="h-5 w-5" /></div>
        <span className="text-lg font-semibold tracking-tight">FleetOps</span>
      </div>
      <div className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        {NAV.map((g) => {
          const items = g.items.filter((i) => can(user.role, i.perm));
          if (!items.length) return null;
          return (
            <div key={g.section}>
              <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{g.section}</p>
              {items.map((i) => {
                const active = path === i.href || path.startsWith(i.href + "/");
                return (
                  <Link key={i.href} href={i.href} onClick={() => setOpen(false)}
                    className={clsx("flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition",
                      active ? "bg-slate-800 text-white" : "hover:bg-slate-800/60 hover:text-white")}>
                    <i.icon className={clsx("h-4 w-4", active ? "text-blue-400" : "text-slate-400")} />
                    {i.label}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="border-t border-slate-800 p-3">
        <Link href="/account" className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-800">
          <UserCircle className="h-8 w-8 text-slate-400" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">{user.name}</p>
            <p className="truncate text-xs text-slate-400">{ROLE_LABELS[user.role as Role]}</p>
          </div>
        </Link>
        <form action={logout}>
          <button className="mt-1 flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm hover:bg-slate-800 hover:text-white">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </form>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 lg:block print:hidden">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64">{sidebar}</aside>
        </div>
      )}
      <div className="lg:pl-60 print:pl-0">
        <header className="sticky top-0 z-20 flex h-14 print:hidden items-center justify-between border-b border-slate-200 bg-white/85 px-4 backdrop-blur lg:px-8">
          <button className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="hidden text-sm text-slate-500 lg:block" suppressHydrationWarning>
            {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
          </div>
          <div className="relative">
            {alerts.length > 0 && (
              <button onClick={() => setBell((b) => !b)} className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label="Alerts">
                <Bell className="h-5 w-5" />
                <span className={clsx("absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white",
                  critical ? "bg-rose-600" : "bg-amber-500")}>{alerts.length}</span>
              </button>
            )}
            {bell && (
              <div className="absolute right-0 mt-2 max-h-[70vh] w-80 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Needs attention</p>
                {alerts.map((a, i) => (
                  <Link key={i} href={a.href} onClick={() => setBell(false)} className="flex gap-2 rounded-lg px-2 py-2 hover:bg-slate-50">
                    <span className={clsx("mt-1.5 h-2 w-2 shrink-0 rounded-full", a.level === "critical" ? "bg-rose-500" : "bg-amber-400")} />
                    <span>
                      <span className="block text-sm font-medium text-slate-800">{a.title}</span>
                      <span className="block text-xs text-slate-500">{a.detail}</span>
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </header>
        <main className="mx-auto max-w-[1500px] p-4 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
