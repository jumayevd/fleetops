import type { Alert } from "@/lib/alerts";
import type { FleetSnapshot } from "@/lib/telemetry";
import { can, type Permission } from "@/lib/permissions";
import { TIMEZONE } from "@/lib/constants";
import type { Tone } from "@/components/ui";

/* ------------------------------------------------------------------ */
/* Alerts → insight groups                                             */
/* ------------------------------------------------------------------ */

export type AlertKind = Alert["kind"];

export const KIND_LABEL: Record<AlertKind, string> = {
  compliance: "Compliance", dispatch: "Dispatch", fleet: "Fleet", money: "Money", safety: "Safety",
};
export const KINDS: AlertKind[] = ["dispatch", "compliance", "fleet", "money", "safety"];
export const isKind = (v: unknown): v is AlertKind => typeof v === "string" && (KINDS as string[]).includes(v);

// Which permission a destination needs. Alerts pointing somewhere this role cannot open are hidden
// rather than shown as dead links (requireUser would bounce them back to the dashboard).
const ROUTE_PERMS: [prefix: string, perm: Permission][] = [
  ["/finance", "finance.view"], ["/claims", "claims.view"], ["/fleet", "fleet.view"], ["/drivers", "drivers.view"],
  ["/customers", "customers.view"], ["/admin", "company.manage"], ["/loads", "loads.view"], ["/dispatch", "loads.view"],
];
export function canOpen(role: string, href: string) {
  const hit = ROUTE_PERMS.find(([p]) => href === p || href.startsWith(`${p}/`) || href.startsWith(`${p}?`));
  return hit ? can(role, hit[1]) : true;
}
export const visibleAlerts = (alerts: Alert[], role: string) => alerts.filter((a) => canOpen(role, a.href));

export type AlertGroup = { kind: AlertKind; label: string; items: Alert[]; critical: number; tone: Tone };

/** Group by kind, worst first. Items inside a group keep getAlerts() order (critical first). */
export function groupAlerts(alerts: Alert[]): AlertGroup[] {
  const by = new Map<AlertKind, Alert[]>();
  for (const a of alerts) by.set(a.kind, [...(by.get(a.kind) ?? []), a]);
  return [...by]
    .map(([kind, items]) => {
      const critical = items.filter((i) => i.level === "critical").length;
      return { kind, label: KIND_LABEL[kind], items, critical, tone: (critical ? "danger" : "warn") as Tone };
    })
    .sort((a, b) => b.critical - a.critical || b.items.length - a.items.length);
}

/* ------------------------------------------------------------------ */
/* Fleet                                                               */
/* ------------------------------------------------------------------ */

/** Same threshold the live map uses: above this a truck counts as moving. */
export const ROLLING_KMH = 5;
export const movingTrucks = (fleet: Pick<FleetSnapshot[number], "status" | "speedKmh">[]) =>
  fleet.filter((t) => t.status === "ACTIVE" && t.speedKmh > ROLLING_KMH).length;

/* ------------------------------------------------------------------ */
/* Activity feed                                                       */
/* ------------------------------------------------------------------ */

/** LoadEvent.type → tone. Problems are red, hand-offs blue, movement violet, bookkeeping quiet. */
export const EVENT_TONE: Record<string, Tone> = {
  CREATED: "neutral", ASSIGNED: "info", STATUS: "progress", NOTE: "neutral", CHECK_CALL: "info",
  ISSUE: "danger", DOCUMENT: "neutral", BILLING: "ok", EDIT: "neutral",
};

/* ------------------------------------------------------------------ */
/* Copy helpers                                                        */
/* ------------------------------------------------------------------ */

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Percentage-point delta for Stat tiles: "+3 pts" / "-2 pts" / "0 pts". Sign is ASCII so Stat can read it. */
export const pts = (d: number) => `${d > 0 ? "+" : ""}${d} pts`;
export const pct = (d: number) => `${d > 0 ? "+" : ""}${d}%`;

/** Company-local hour, so the greeting is right even when the server runs elsewhere. */
export function companyHour(now: Date) {
  const h = new Intl.DateTimeFormat("en-GB", { hour: "numeric", hour12: false, timeZone: TIMEZONE }).format(now);
  return Number(h) % 24;
}
export const greeting = (now: Date) => {
  const h = companyHour(now);
  return h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
};
export const longDate = (now: Date) =>
  new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: TIMEZONE }).format(now);
