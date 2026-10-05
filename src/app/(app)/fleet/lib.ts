import type { Tone } from "@/components/ui";

/* ------------------------------------------------------------------ */
/* Labels                                                              */
/* ------------------------------------------------------------------ */

export const TRUCK_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Active", MAINTENANCE: "In shop", OUT_OF_SERVICE: "Out of service", INACTIVE: "Inactive",
};

export const OWNERSHIP_TONE: Record<string, Tone> = { COMPANY: "neutral", OWNER_OPERATOR: "progress", LEASED: "info" };
export const OWNERSHIP_SHORT: Record<string, string> = { COMPANY: "Company", OWNER_OPERATOR: "Owner-op", LEASED: "Leased" };

export const FUEL_TYPES = [
  { value: "DIESEL", label: "Diesel" }, { value: "LNG", label: "LNG" }, { value: "CNG", label: "CNG" }, { value: "ELECTRIC", label: "Electric" },
];
export const FUEL_TYPE_LABELS: Record<string, string> = Object.fromEntries(FUEL_TYPES.map((f) => [f.value, f.label]));

/** Telematics vendors offered in the trailer form's datalist (free text is still allowed). */
export const GPS_PROVIDERS = ["Teltonika", "Wialon", "Samsara", "Geotab", "Navixy"];

export const COMPLETED_LOAD_STATUSES = ["DELIVERED", "INVOICED"];

/**
 * Trailer statuses that physically leave the tractor, so setting one clears the pairing. In use and Empty stay hooked:
 * the load workflow marks a trailer Empty on delivery and keeps it on the truck (src/lib/workflow.ts).
 */
export const UNHOOKED_TRAILER_STATUSES: readonly string[] = ["DROPPED", "YARD", "SHOP", "OUT_OF_SERVICE"];

/** The truck and trailer tables stop at this many rows (KPI tiles still count every unit). */
export const LIST_LIMIT = 500;

/* ------------------------------------------------------------------ */
/* Preventive maintenance                                              */
/* ------------------------------------------------------------------ */

export const PM_DUE_SOON_KM = 2000;

export type PmInput = { odometerKm: number; pmIntervalKm: number; lastPmKm: number | null; nextServiceKm: number | null };
export type PmState = "unknown" | "overdue" | "due" | "ok";

/**
 * Next service is the explicit `nextServiceKm`, else last PM + interval (same rule as alerts.ts).
 * `left` < 0 means overdue; `pct` is how far through the interval the unit is (for a progress bar).
 */
export function pmStatus(t: PmInput): { next: number | null; left: number | null; state: PmState; tone: Tone; pct: number | null } {
  const next = t.nextServiceKm ?? (t.lastPmKm != null ? t.lastPmKm + t.pmIntervalKm : null);
  if (next == null) return { next: null, left: null, state: "unknown", tone: "neutral", pct: null };
  const left = next - t.odometerKm;
  const state: PmState = left < 0 ? "overdue" : left < PM_DUE_SOON_KM ? "due" : "ok";
  const tone: Tone = state === "overdue" ? "danger" : state === "due" ? "warn" : "ok";
  const start = t.lastPmKm ?? next - t.pmIntervalKm;
  const pct = Math.min(1, Math.max(0, (t.odometerKm - start) / Math.max(1, next - start)));
  return { next, left, state, tone, pct };
}

/* ------------------------------------------------------------------ */
/* Lease mileage control                                               */
/* ------------------------------------------------------------------ */

export type LeaseInput = {
  ownership: string; odometerKm: number; lessor: string | null;
  leaseStartKm: number | null; leaseAnnualLimitKm: number | null; leaseBufferPct: number | null; leaseOverageRate: number | null;
};
export type LeaseState = "ok" | "near" | "buffer" | "over";

/**
 * allowed = start + annual limit; hard cap = allowed + buffer. Over the hard cap costs `rate` per km.
 * Mirrors the alert rule in src/lib/alerts.ts so the truck page and the alert agree.
 */
export function leaseStatus(t: LeaseInput) {
  if (t.ownership !== "LEASED" || !t.leaseAnnualLimitKm) return null;
  const startKm = t.leaseStartKm ?? 0;
  const limitKm = t.leaseAnnualLimitKm;
  const bufferPct = t.leaseBufferPct ?? 0;
  const allowedKm = startKm + limitKm;
  const hardCapKm = startKm + Math.round(limitKm * (1 + bufferPct / 100));
  const usedKm = Math.max(0, t.odometerKm - startKm);
  const remainingKm = hardCapKm - t.odometerKm; // negative = over the hard cap
  const overKm = Math.max(0, -remainingKm);
  const rate = t.leaseOverageRate ?? 0;
  const exposure = overKm * rate;
  const state: LeaseState = overKm > 0 ? "over" : t.odometerKm > allowedKm ? "buffer" : remainingKm < 5000 ? "near" : "ok";
  const tone: Tone = state === "over" ? "danger" : state === "ok" ? "ok" : "warn";
  const span = Math.max(1, hardCapKm - startKm);
  return {
    lessor: t.lessor, startKm, limitKm, bufferPct, allowedKm, hardCapKm, usedKm, remainingKm, overKm, rate, exposure, state, tone,
    pct: Math.min(1, usedKm / span),
    allowedMarker: Math.min(1, limitKm / span),
  };
}

/* ------------------------------------------------------------------ */
/* Telemetry helpers                                                   */
/* ------------------------------------------------------------------ */

const DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
export function compass(deg: number | null | undefined) {
  if (deg == null) return "—";
  return DIRS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}

export function pingSourceLabel(src: string | null | undefined) {
  switch (src) {
    case "DEVICE": return "Driver GPS";
    case "SAMSARA": return "Samsara";
    case "SIMULATED": return "Route estimate";
    default: return src ?? "No source";
  }
}

export function pingStale(d: Date | string | null | undefined, hours = 1) {
  if (!d) return true;
  return Date.now() - new Date(d).getTime() > hours * 3_600_000;
}

export function fuelTone(pct: number | null | undefined): Tone {
  if (pct == null) return "neutral";
  if (pct < 15) return "danger";
  if (pct < 30) return "warn";
  return "ok";
}

/** Compact duration since a timestamp: 12m · 5h · 3d · 2mo. */
export function sinceShort(d: Date | string | null | undefined) {
  if (!d) return "—";
  const m = Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 60_000));
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  const days = Math.floor(h / 24);
  if (days < 60) return `${days}d`;
  return `${Math.floor(days / 30)}mo`;
}

/** Whole days since a timestamp (status timers, time in shop). */
export function daysSince(d: Date | string) {
  return Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000));
}

/**
 * Earliest of the given dates, ignoring missing ones. Paperwork expiry is the earlier of the date on the unit record and
 * the expiry on the newest uploaded document of that kind, so a stale record date can't hide an expired certificate.
 */
export function earliest(...dates: (Date | null | undefined)[]): Date | null {
  let min: Date | null = null;
  for (const d of dates) if (d && (!min || d < min)) min = d;
  return min;
}

/* ------------------------------------------------------------------ */
/* Documents & notes                                                   */
/* ------------------------------------------------------------------ */

/** unitId → set of required document kinds on file. */
export function docsByUnit(rows: { id: string | null; kind: string }[]) {
  const m = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!r.id) continue;
    if (!m.has(r.id)) m.set(r.id, new Set());
    m.get(r.id)!.add(r.kind);
  }
  return m;
}

export function missingDocs(have: Set<string> | undefined, required: readonly string[]) {
  return required.filter((k) => !have?.has(k));
}

export type TruckNote = { date: string | null; author: string | null; text: string };

/** Notes are stored newest-first as "YYYY-MM-DD Name: text" lines (see addTruckNote). */
export function parseNotes(notes: string | null | undefined): TruckNote[] {
  if (!notes) return [];
  return notes.split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
    const m = line.match(/^(\d{4}-\d{2}-\d{2}) ([^:]+): (.*)$/);
    return m ? { date: m[1], author: m[2], text: m[3] } : { date: null, author: null, text: line };
  });
}
