"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  LayoutDashboard, Rows3, Package, Map, CalendarRange, Navigation, Truck, Container, Wrench, ClipboardList, Users, Building2,
  Receipt, BarChart3, ShieldAlert, MessageSquare, Megaphone, Landmark, ShieldCheck, Send, ScrollText,
  Bell, Search, Menu, X, LogOut, UserCircle, PanelLeftClose, PanelLeftOpen, ChevronRight, type LucideIcon,
} from "lucide-react";
import { cn, Avatar, Kbd, StatusDot } from "./ui";
import { ThemeToggle } from "./theme-toggle";
import { CommandPalette } from "./command-palette";
import { NAV, SEGMENT_LABELS, allNavItems, findNavItem } from "@/lib/nav";
import { can } from "@/lib/permissions";
import { ROLE_LABELS, type Role } from "@/lib/constants";
import { logout } from "@/app/actions/auth";
import type { Alert } from "@/lib/alerts";

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard, Rows3, Package, Map, CalendarRange, Navigation, Truck, Container, Wrench, ClipboardList, Users, Building2,
  Receipt, BarChart3, ShieldAlert, MessageSquare, Megaphone, Landmark, ShieldCheck, Send, ScrollText,
};

// Sidebar pin preference lives in localStorage; exposed as an external store (no setState-in-effect).
const PIN_KEY = "fleetops.nav.pinned";
const pinListeners = new Set<() => void>();
const readPinned = () => { try { return localStorage.getItem(PIN_KEY) === "1"; } catch { return false; } };
const writePinned = (v: boolean) => { try { localStorage.setItem(PIN_KEY, v ? "1" : "0"); } catch { /* storage unavailable */ } pinListeners.forEach((l) => l()); };
const subscribePinned = (cb: () => void) => { pinListeners.add(cb); return () => { pinListeners.delete(cb); }; };

type ShellUser = { name: string; email: string; role: string };

export function AppShell({ user, alerts, badges = {}, children }: {
  user: ShellUser;
  alerts: Alert[];
  /** href → count shown as a quiet chip in the nav (e.g. open alerts, unread chat). */
  badges?: Record<string, number>;
  children: ReactNode;
}) {
  const path = usePathname();
  const router = useRouter();
  const pinned = useSyncExternalStore(subscribePinned, readPinned, () => false);
  const [cmd, setCmd] = useState(false);
  const chord = useRef<string | null>(null);

  // Global keys: ⌘K / Ctrl+K or "/" opens search; "g" then a letter jumps (g l → loads).
  useEffect(() => {
    const shortcuts = Object.fromEntries(allNavItems().filter((i) => i.shortcut && can(user.role, i.perm)).map((i) => [i.shortcut!.split(" ")[1], i.href]));
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setCmd((c) => !c); return; }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/") { e.preventDefault(); setCmd(true); return; }
      if (chord.current === "g") {
        chord.current = null;
        const href = shortcuts[e.key.toLowerCase()];
        if (href) { e.preventDefault(); router.push(href); }
        return;
      }
      if (e.key === "g") { chord.current = "g"; setTimeout(() => { chord.current = null; }, 1200); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, user.role]);

  return (
    <div className="min-h-screen">
      {/* Desktop rail: 56px, expands to 240px on hover or when pinned */}
      <aside className={cn("group/rail fixed inset-y-0 left-0 z-40 hidden border-r border-line bg-surface transition-[width] duration-150 ease-out lg:block print:hidden",
        pinned ? "w-60" : "w-14 hover:w-60")}>
        <div className={cn(pinned ? "block" : "hidden group-hover/rail:block", "h-full")}><SideNav user={user} path={path} badges={badges} expanded pinned={pinned} /></div>
        {!pinned && <div className="h-full group-hover/rail:hidden"><SideNav user={user} path={path} badges={badges} expanded={false} pinned={pinned} /></div>}
      </aside>

      <div className={cn("transition-[padding] duration-150", pinned ? "lg:pl-60" : "lg:pl-14", "print:pl-0")}>
        {/* Keyed by path so popovers and the mobile drawer close on navigation without effects. */}
        <TopBar key={path} user={user} path={path} alerts={alerts} badges={badges} pinned={pinned} openSearch={() => setCmd(true)} />
        <main className="p-4 lg:p-5">{children}</main>
      </div>
      {cmd && <CommandPalette onClose={() => setCmd(false)} role={user.role} />}
    </div>
  );
}

function SideNav({ user, path, badges, expanded, pinned, onNavigate }: {
  user: ShellUser; path: string; badges: Record<string, number>; expanded: boolean; pinned: boolean; onNavigate?: () => void;
}) {
  return (
    <nav className="flex h-full flex-col">
      <div className={cn("flex h-11 items-center border-b border-line", expanded ? "px-3" : "justify-center")}>
        <Link href="/" className="flex items-center gap-2 text-fg" aria-label="FleetOps home">
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent text-on-accent"><Truck className="h-3.5 w-3.5" /></span>
          {expanded && <span className="text-[13px] font-semibold tracking-tight">FleetOps</span>}
        </Link>
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-2">
        {NAV.map((g) => {
          const items = g.items.filter((i) => can(user.role, i.perm));
          if (!items.length) return null;
          return (
            <div key={g.section} className="mb-2">
              {expanded ? <p className="eyebrow px-4 pb-1 pt-2">{g.section}</p> : <div className="mx-4 my-2 border-t border-line" />}
              {items.map((i) => {
                const Icon = ICONS[i.icon] ?? Package;
                const active = findNavItem(path)?.href === i.href;
                const n = badges[i.href];
                return (
                  <Link key={i.href} href={i.href} title={expanded ? undefined : i.label} onClick={onNavigate}
                    className={cn("group relative mx-2 flex h-8 items-center gap-2.5 rounded-md text-[13px] transition-colors",
                      expanded ? "px-2" : "justify-center",
                      active ? "bg-raised font-medium text-fg" : "text-fg-muted hover:bg-raised hover:text-fg")}>
                    {active && <span className="absolute -left-2 top-1.5 h-5 w-0.5 rounded-r bg-accent" />}
                    <Icon className={cn("h-4 w-4 shrink-0", active ? "text-accent-text" : "text-fg-subtle group-hover:text-fg-muted")} />
                    {expanded && <span className="truncate">{i.label}</span>}
                    {n ? (
                      expanded
                        ? <span className="num ml-auto rounded bg-neutral-soft px-1 text-[10px] text-fg-muted">{n}</span>
                        : <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent" />
                    ) : null}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="border-t border-line p-2">
        <button onClick={() => writePinned(!pinned)} className={cn("hidden h-8 w-full items-center gap-2.5 rounded-md text-[12px] text-fg-subtle hover:bg-raised hover:text-fg lg:flex", expanded ? "px-2" : "justify-center")} title={pinned ? "Collapse sidebar" : "Keep sidebar open"}>
          {pinned ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          {expanded && <span>{pinned ? "Collapse" : "Keep open"}</span>}
        </button>
      </div>
    </nav>
  );
}

function TopBar({ user, path, alerts, badges, pinned, openSearch }: {
  user: ShellUser; path: string; alerts: Alert[]; badges: Record<string, number>; pinned: boolean; openSearch: () => void;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [bell, setBell] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const critical = alerts.filter((a) => a.level === "critical").length;
  const crumbs = breadcrumbs(path);

  return (
    <>
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-scrim" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-line bg-surface">
            <SideNav user={user} path={path} badges={badges} expanded pinned={pinned} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}
      <header className="sticky top-0 z-30 flex h-11 items-center gap-2 border-b border-line bg-canvas/80 px-3 backdrop-blur print:hidden lg:px-5">
        <button className="rounded-md p-1.5 text-fg-muted hover:bg-raised lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
          {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
        <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-[13px]">
          {crumbs.map((c, i) => (
            <span key={c.href} className="flex min-w-0 items-center gap-1">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-fg-faint" />}
              {i === crumbs.length - 1
                ? <span className="truncate font-medium text-fg">{c.label}</span>
                : <Link href={c.href} className="truncate text-fg-muted hover:text-fg">{c.label}</Link>}
            </span>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={openSearch} className="hidden h-7 items-center gap-2 rounded-md border border-line bg-surface px-2 text-[12px] text-fg-subtle hover:border-line-strong hover:text-fg sm:flex" aria-label="Search">
            <Search className="h-3.5 w-3.5" /><span className="pr-6">Search</span><Kbd>⌘K</Kbd>
          </button>
          <button onClick={openSearch} className="rounded-md p-1.5 text-fg-muted hover:bg-raised sm:hidden" aria-label="Search"><Search className="h-4 w-4" /></button>
          <ThemeToggle />
          <div className="relative">
            <button onClick={() => { setBell((b) => !b); setUserMenu(false); }} className="relative rounded-md p-1.5 text-fg-muted hover:bg-raised hover:text-fg" aria-label={`Alerts (${alerts.length})`}>
              <Bell className="h-4 w-4" />
              {alerts.length > 0 && <span className={cn("absolute right-1 top-1 h-2 w-2 rounded-full ring-2 ring-canvas", critical ? "bg-danger" : "bg-warn")} />}
            </button>
            {bell && (
              <Popover onClose={() => setBell(false)} className="w-80">
                <div className="flex items-center justify-between px-3 py-2">
                  <p className="text-[12px] font-semibold text-fg">Needs attention</p>
                  <span className="num text-[11px] text-fg-subtle">{critical} critical · {alerts.length - critical} warnings</span>
                </div>
                <ul className="max-h-[60vh] overflow-y-auto border-t border-line">
                  {alerts.length === 0 && <li className="px-3 py-6 text-center text-[12px] text-fg-subtle">All clear</li>}
                  {alerts.map((a, i) => (
                    <li key={i}>
                      <Link href={a.href} className="flex gap-2.5 px-3 py-2 hover:bg-raised">
                        <StatusDot tone={a.level === "critical" ? "danger" : "warn"} className="mt-1.5" />
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] text-fg">{a.title}</span>
                          <span className="block truncate text-[11px] text-fg-subtle">{a.detail}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Popover>
            )}
          </div>
          <div className="relative">
            <button onClick={() => { setUserMenu((u) => !u); setBell(false); }} className="flex items-center gap-2 rounded-md p-1 pr-2 hover:bg-raised" aria-label="Account menu">
              <Avatar name={user.name} size={24} />
              <span className="hidden text-[12px] text-fg-muted md:block">{user.name.split(" ")[0]}</span>
            </button>
            {userMenu && (
              <Popover onClose={() => setUserMenu(false)} className="w-56">
                <div className="px-3 py-2">
                  <p className="truncate text-[13px] font-medium text-fg">{user.name}</p>
                  <p className="truncate text-[11px] text-fg-subtle">{ROLE_LABELS[user.role as Role]} · {user.email}</p>
                </div>
                <div className="border-t border-line p-1">
                  <Link href="/account" className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-fg-muted hover:bg-raised hover:text-fg"><UserCircle className="h-4 w-4" />My account</Link>
                  <form action={logout}><button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[13px] text-fg-muted hover:bg-raised hover:text-fg"><LogOut className="h-4 w-4" />Sign out</button></form>
                </div>
              </Popover>
            )}
          </div>
        </div>
      </header>
    </>
  );
}

function Popover({ children, onClose, className }: { children: ReactNode; onClose: () => void; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onDown); document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [onClose]);
  return <div ref={ref} className={cn("absolute right-0 top-full z-50 mt-1.5 overflow-hidden rounded-lg border border-line bg-overlay shadow-float", className)}>{children}</div>;
}

function breadcrumbs(path: string): { href: string; label: string }[] {
  const item = findNavItem(path);
  const out: { href: string; label: string }[] = [];
  if (item) out.push({ href: item.href, label: item.label });
  const base = item?.href ?? "";
  const rest = path.slice(base.length).split("/").filter(Boolean);
  let acc = base;
  for (const seg of rest) {
    acc += `/${seg}`;
    const label = SEGMENT_LABELS[seg] ?? (seg.length > 16 ? "Details" : seg[0].toUpperCase() + seg.slice(1));
    out.push({ href: acc, label });
  }
  if (!out.length) out.push({ href: path, label: SEGMENT_LABELS[rest[0]] ?? "FleetOps" });
  return out;
}
