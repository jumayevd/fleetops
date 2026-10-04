import "server-only";
import { tool } from "ai";
import { z } from "zod";
import { startOfWeek } from "date-fns";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { can, type Permission } from "@/lib/permissions";
import { getAlerts } from "@/lib/alerts";
import { receivables as receivablesAging, weeklyProduction } from "@/lib/stats";
import { estimatedArrival, loadProgress, syncSimulatedPositions } from "@/lib/telemetry";
import {
  BOARD_STATUSES, BOARD_STATUS_LABELS, CLAIM_FAULT_LABELS, CLAIM_OPEN_STATUSES, CLAIM_TYPE_LABELS, DRIVER_TYPE_LABELS,
  LOAD_STATUSES, LOAD_STATUS_LABELS, OWNERSHIP, OWNERSHIP_LABELS, REQUIRED_LOAD_DOCS, TIMEZONE, TRAILER_STATUS_LABELS, TRUCK_STATUSES,
  humanize, type BoardStatus, type LoadStatus,
} from "@/lib/constants";

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

/** Hard cap on list sizes handed to the model. */
export const LIMIT = 25;
const DAY = 86_400_000;
const HOUR = 3_600_000;
/** Below this speed a truck counts as idle (same threshold as the live map). */
const ROLLING_KMH = 5;
/** Service due inside this many km is "due soon" (same rule as the fleet page and alerts). */
const PM_DUE_SOON_KM = 2000;
const ACTIVE_LOAD = ["ASSIGNED", "IN_TRANSIT"] as const;

const dt = new Intl.DateTimeFormat("en-GB", { timeZone: TIMEZONE, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
const d = new Intl.DateTimeFormat("en-GB", { timeZone: TIMEZONE, day: "2-digit", month: "short", year: "numeric" });
/** "03 Oct 2026, 14:05" in the company timezone. */
export const fmtDateTime = (v: Date | null | undefined) => (v ? dt.format(v) : null);
export const fmtDate = (v: Date | null | undefined) => (v ? d.format(v) : null);
const round = (n: number, dp = 0) => Math.round(n * 10 ** dp) / 10 ** dp;
const daysSince = (v: Date, now = Date.now()) => Math.floor((now - v.getTime()) / DAY);
const daysUntil = (v: Date | null | undefined, now = Date.now()) => (v ? Math.ceil((v.getTime() - now) / DAY) : null);
const label = <T extends string>(map: Record<string, string>, v: T) => map[v] ?? humanize(v);
const loadLabel = (s: string) => label(LOAD_STATUS_LABELS, s as LoadStatus);
const boardLabel = (s: string) => label(BOARD_STATUS_LABELS, s as BoardStatus);
const like = (q: string) => ({ contains: q, mode: "insensitive" as const });

/** Cap a list and say so, so the model can tell the user "showing 25 of 61". */
function capped<T>(rows: T[], key: string) {
  return { total: rows.length, showing: Math.min(LIMIT, rows.length), truncated: rows.length > LIMIT, [key]: rows.slice(0, LIMIT) };
}

type PmInput = { odometerKm: number; pmIntervalKm: number; lastPmKm: number | null; nextServiceKm: number | null };
/** Next service = explicit nextServiceKm, else last PM + interval. kmLeft < 0 means overdue. */
function pmStatus(t: PmInput) {
  const next = t.nextServiceKm ?? (t.lastPmKm != null ? t.lastPmKm + t.pmIntervalKm : null);
  if (next == null) return { nextServiceKm: null, kmLeft: null, state: "unknown" as const };
  const left = next - t.odometerKm;
  return { nextServiceKm: next, kmLeft: left, state: left < 0 ? ("overdue" as const) : left < PM_DUE_SOON_KM ? ("due soon" as const) : ("ok" as const) };
}

type RiskInput = { score: number; licenseExpiry: Date; medicalExpiry: Date | null };
/** Same rule as the drivers page: score under 75, or licence / medical expired or expiring within 30 days. */
function riskReasons(dr: RiskInput, now = Date.now()) {
  const out: string[] = [];
  if (dr.score < 75) out.push(`score ${dr.score}`);
  const lic = daysUntil(dr.licenseExpiry, now)!;
  if (lic < 0) out.push(`licence expired ${-lic}d ago`); else if (lic <= 30) out.push(`licence expires in ${lic}d`);
  const med = daysUntil(dr.medicalExpiry, now);
  if (med != null) { if (med < 0) out.push(`medical expired ${-med}d ago`); else if (med <= 30) out.push(`medical expires in ${med}d`); }
  return out;
}

const missingLoadDocs = (docs: { kind: string }[]) => {
  const have = new Set(docs.map((x) => x.kind));
  return REQUIRED_LOAD_DOCS.filter((k) => !have.has(k));
};

/** Compact load row shared by several tools. */
const LOAD_ROW = {
  id: true, reference: true, status: true, priority: true, billingStage: true, customerRef: true,
  originCity: true, originName: true, destCity: true, destName: true, pickupAt: true, deliveryAt: true, departedAt: true, deliveredAt: true,
  distanceKm: true, emptyKm: true, rate: true, commodity: true, weightKg: true, equipment: true, hazmat: true,
  customer: { select: { name: true } }, broker: { select: { name: true } }, team: { select: { name: true } },
  driver: { select: { id: true, name: true, phone: true, hold: true } }, truck: { select: { id: true, unitNumber: true } }, trailer: { select: { unitNumber: true } },
  documents: { select: { kind: true } },
} satisfies Prisma.LoadSelect;
type LoadRow = Prisma.LoadGetPayload<{ select: typeof LOAD_ROW }>;

function loadView(l: LoadRow, opts: { money: boolean }) {
  return {
    reference: l.reference, href: `/loads/${l.id}`, status: loadLabel(l.status), priority: humanize(l.priority),
    customer: l.customer.name, broker: l.broker?.name ?? null, customerRef: l.customerRef, team: l.team?.name ?? null,
    route: `${l.originCity} → ${l.destCity}`, pickupAt: fmtDateTime(l.pickupAt), deliveryAt: fmtDateTime(l.deliveryAt),
    departedAt: fmtDateTime(l.departedAt), deliveredAt: fmtDateTime(l.deliveredAt),
    distanceKm: round(l.distanceKm), emptyKm: round(l.emptyKm), commodity: l.commodity, weightKg: round(l.weightKg), equipment: humanize(l.equipment), hazmat: l.hazmat,
    driver: l.driver ? { name: l.driver.name, phone: l.driver.phone, hold: l.driver.hold, href: `/drivers/${l.driver.id}` } : null,
    truck: l.truck ? { unit: l.truck.unitNumber, href: `/fleet/${l.truck.id}` } : null, trailer: l.trailer?.unitNumber ?? null,
    hasRateConfirmation: l.documents.some((x) => x.kind === "RC"), hasProofOfDelivery: l.documents.some((x) => x.kind === "POD"),
    billingStage: humanize(l.billingStage),
    ...(opts.money ? { rateUsd: round(l.rate), revenuePerKm: l.distanceKm ? round(l.rate / l.distanceKm, 2) : null } : {}),
  };
}

const TRUCK_ROW = {
  id: true, unitNumber: true, make: true, model: true, year: true, plate: true, status: true, ownership: true, group: true, lessor: true,
  odometerKm: true, pmIntervalKm: true, lastPmKm: true, lastPmAt: true, nextServiceKm: true, speedKmh: true, engineOn: true, fuelPct: true,
  locationName: true, lastPingAt: true, insuranceExpiry: true, inspectionExpiry: true, registrationExpiry: true,
  driver: { select: { id: true, name: true, phone: true, hold: true, boardStatus: true } },
  loads: { where: { status: { in: [...ACTIVE_LOAD] } }, orderBy: { pickupAt: "asc" as const }, take: 1, select: { id: true, reference: true, status: true, destCity: true, deliveryAt: true, departedAt: true, distanceKm: true } },
} satisfies Prisma.TruckSelect;
type TruckRow = Prisma.TruckGetPayload<{ select: typeof TRUCK_ROW }>;

function truckView(t: TruckRow, now = Date.now()) {
  const l = t.loads[0];
  const pm = pmStatus(t);
  const moving = (t.speedKmh ?? 0) > ROLLING_KMH;
  return {
    unit: t.unitNumber, href: `/fleet/${t.id}`, vehicle: `${t.year} ${t.make} ${t.model}`, plate: t.plate,
    status: t.status === "MAINTENANCE" ? "In shop" : humanize(t.status), ownership: label(OWNERSHIP_LABELS, t.ownership), group: t.group, lessor: t.lessor,
    driver: t.driver ? { name: t.driver.name, phone: t.driver.phone, boardStatus: boardLabel(t.driver.boardStatus), hold: t.driver.hold, href: `/drivers/${t.driver.id}` } : null,
    currentLoad: l ? { reference: l.reference, status: loadLabel(l.status), to: l.destCity, deliveryAt: fmtDateTime(l.deliveryAt), eta: fmtDateTime(l.status === "IN_TRANSIT" ? estimatedArrival(l) : null), progressPct: l.status === "IN_TRANSIT" ? round(loadProgress(l, now) * 100) : null, href: `/loads/${l.id}` } : null,
    motion: moving ? "rolling" : t.engineOn ? "idle (engine on)" : "stopped", speedKmh: round(t.speedKmh ?? 0), location: t.locationName,
    lastSeen: fmtDateTime(t.lastPingAt), fuelPct: t.fuelPct == null ? null : round(t.fuelPct),
    odometerKm: t.odometerKm, service: { ...pm, lastPmAt: fmtDate(t.lastPmAt), intervalKm: t.pmIntervalKm },
    papers: { insurance: fmtDate(t.insuranceExpiry), inspection: fmtDate(t.inspectionExpiry), registration: fmtDate(t.registrationExpiry) },
  };
}

/* ------------------------------------------------------------------ */
/* Tool set                                                            */
/* ------------------------------------------------------------------ */

export type ToolContext = { role: string };

/** Which permission each tool needs. Tools the role cannot use are not offered to the model at all. */
export const TOOL_PERMISSION = {
  fleetStatus: "fleet.view", listTrucks: "fleet.view", maintenanceDue: "fleet.view",
  listDrivers: "drivers.view",
  lateLoads: "loads.view", loadsByStatus: "loads.view", findLoad: "loads.view", weeklyProduction: "loads.view",
  billingQueue: "finance.view", receivables: "finance.view",
  openClaims: "claims.view",
  alerts: "dashboard.view",
  searchEverything: "dashboard.view",
} as const satisfies Record<string, Permission>;
export type AssistantToolName = keyof typeof TOOL_PERMISSION;
export const TOOL_NAMES = Object.keys(TOOL_PERMISSION) as AssistantToolName[];
export const FINANCE_TOOLS: AssistantToolName[] = ["billingQueue", "receivables"];

export const allowedTools = (role: string) => TOOL_NAMES.filter((n) => can(role, TOOL_PERMISSION[n]));

/**
 * Read-only tools, closed over the caller's role. Every tool double-checks its permission so a
 * mis-routed call never leaks data, even though disallowed tools are not offered to the model.
 */
export function buildAssistantTools(ctx: ToolContext) {
  const money = can(ctx.role, "finance.view");
  const denied = (name: AssistantToolName) => (can(ctx.role, TOOL_PERMISSION[name]) ? null : { error: `Your role cannot use ${name}. Say that this information is not available to you.` });

  return {
    fleetStatus: tool({
      description: "Fleet snapshot right now: trucks by status, how many are rolling / idle / on a load / without a driver, trailers by status, drivers by board status, and active loads by status. Use this first for any 'how is the fleet doing' question.",
      inputSchema: z.object({}),
      execute: async () => {
        const no = denied("fleetStatus"); if (no) return no;
        await syncSimulatedPositions();
        const [trucks, trailers, drivers, loads, activeTrucks] = await Promise.all([
          db.truck.findMany({ select: { id: true, status: true, speedKmh: true, engineOn: true, driverId: true } }),
          db.trailer.groupBy({ by: ["status"], _count: true }),
          db.driver.findMany({ where: { status: { not: "INACTIVE" } }, select: { boardStatus: true, hold: true, status: true } }),
          db.load.groupBy({ by: ["status"], _count: true, where: { status: { in: ["PLANNED", "ASSIGNED", "IN_TRANSIT", "DELIVERED"] } } }),
          db.load.findMany({ where: { status: { in: [...ACTIVE_LOAD] }, truckId: { not: null } }, select: { truckId: true }, distinct: ["truckId"] }),
        ]);
        const onLoad = new Set(activeTrucks.map((l) => l.truckId));
        const active = trucks.filter((t) => t.status === "ACTIVE");
        const count = <T,>(xs: T[], f: (x: T) => boolean) => xs.filter(f).length;
        return {
          asOf: fmtDateTime(new Date()),
          trucks: {
            total: trucks.length,
            byStatus: Object.fromEntries(TRUCK_STATUSES.map((s) => [s === "MAINTENANCE" ? "In shop" : humanize(s), count(trucks, (t) => t.status === s)])),
            rolling: count(active, (t) => (t.speedKmh ?? 0) > ROLLING_KMH),
            idle: count(active, (t) => (t.speedKmh ?? 0) <= ROLLING_KMH),
            onLoad: count(active, (t) => onLoad.has(t.id)),
            availableNoLoad: count(active, (t) => !onLoad.has(t.id) && t.driverId != null),
            withoutDriver: count(active, (t) => t.driverId == null),
          },
          trailers: Object.fromEntries(trailers.map((r) => [label(TRAILER_STATUS_LABELS, r.status), r._count])),
          drivers: {
            working: drivers.length,
            onHold: count(drivers, (x) => x.hold),
            onLeave: count(drivers, (x) => x.status === "ON_LEAVE"),
            byBoardStatus: Object.fromEntries(BOARD_STATUSES.map((s) => [boardLabel(s), count(drivers, (x) => x.boardStatus === s)]).filter(([, n]) => n)),
          },
          loads: Object.fromEntries(loads.map((r) => [loadLabel(r.status), r._count])),
          hints: { idle: "idle = active truck at or below 5 km/h", availableNoLoad: "active truck with a driver and no dispatched or in-transit load" },
        };
      },
    }),

    listTrucks: tool({
      description: "List trucks with optional filters: status, ownership, fleet group, idle (active trucks with no current load — spare capacity), pmOverdue (past the service interval). Returns up to 25 trucks with driver, current load, location, odometer, service and paperwork dates.",
      inputSchema: z.object({
        status: z.enum(TRUCK_STATUSES).optional().describe("ACTIVE | MAINTENANCE (in shop) | OUT_OF_SERVICE | INACTIVE"),
        ownership: z.enum(OWNERSHIP).optional().describe("COMPANY | OWNER_OPERATOR | LEASED"),
        group: z.string().optional().describe("Fleet group / company label (case-insensitive contains)"),
        idle: z.boolean().optional().describe("true = only active trucks with no dispatched or in-transit load"),
        pmOverdue: z.boolean().optional().describe("true = only trucks whose service is overdue"),
      }),
      execute: async (f) => {
        const no = denied("listTrucks"); if (no) return no;
        await syncSimulatedPositions();
        const where: Prisma.TruckWhereInput = {
          AND: [
            f.status ? { status: f.status } : f.idle ? { status: "ACTIVE" } : {},
            f.ownership ? { ownership: f.ownership } : {},
            f.group ? { group: like(f.group) } : {},
            f.idle ? { loads: { none: { status: { in: [...ACTIVE_LOAD] } } } } : {},
          ],
        };
        const now = Date.now();
        let rows = (await db.truck.findMany({ where, orderBy: { unitNumber: "asc" }, select: TRUCK_ROW })).map((t) => truckView(t, now));
        if (f.pmOverdue) rows = rows.filter((t) => t.service.state === "overdue");
        return { filters: f, ...capped(rows, "trucks") };
      },
    }),

    listDrivers: tool({
      description: "List drivers (not inactive) with optional filters: boardStatus (dispatch board state), team name, hold (on hold with reason), atRisk (score under 75 or licence / medical expiring within 30 days). Returns up to 25 drivers with phone, truck, current load, status since, score and paperwork dates.",
      inputSchema: z.object({
        boardStatus: z.enum(BOARD_STATUSES).optional().describe("READY | DISPATCHED | AT_PICKUP | EN_ROUTE | UNLOADING | STOP | REST | HOME | VACATION"),
        team: z.string().optional().describe("Dispatcher team name (case-insensitive contains)"),
        hold: z.boolean().optional().describe("true = only drivers on hold"),
        atRisk: z.boolean().optional().describe("true = only at-risk drivers"),
        includeInactive: z.boolean().optional().describe("Include drivers who no longer work here"),
      }),
      execute: async (f) => {
        const no = denied("listDrivers"); if (no) return no;
        const now = Date.now();
        const drivers = await db.driver.findMany({
          where: {
            AND: [
              f.includeInactive ? {} : { status: { not: "INACTIVE" } },
              f.boardStatus ? { boardStatus: f.boardStatus } : {},
              f.team ? { team: { name: like(f.team) } } : {},
              f.hold ? { hold: true } : {},
            ],
          },
          orderBy: { name: "asc" },
          select: {
            id: true, name: true, phone: true, status: true, type: true, boardStatus: true, boardStatusSince: true, boardStatusManual: true, hold: true, holdReason: true,
            score: true, licenseExpiry: true, medicalExpiry: true, hireDate: true,
            team: { select: { name: true } }, truck: { select: { id: true, unitNumber: true } },
            loads: { where: { status: { in: [...ACTIVE_LOAD] } }, orderBy: { status: "desc" }, take: 1, select: { id: true, reference: true, status: true, destCity: true, deliveryAt: true } },
          },
        });
        let rows = drivers.map((x) => {
          const l = x.loads[0];
          return {
            name: x.name, href: `/drivers/${x.id}`, phone: x.phone, employment: humanize(x.status), type: label(DRIVER_TYPE_LABELS, x.type), team: x.team?.name ?? null,
            boardStatus: boardLabel(x.boardStatus), since: fmtDateTime(x.boardStatusSince), hoursInStatus: round((now - x.boardStatusSince.getTime()) / HOUR), manualOverride: x.boardStatusManual,
            hold: x.hold, holdReason: x.hold ? (x.holdReason ?? "no reason recorded") : null,
            truck: x.truck ? { unit: x.truck.unitNumber, href: `/fleet/${x.truck.id}` } : null,
            currentLoad: l ? { reference: l.reference, status: loadLabel(l.status), to: l.destCity, deliveryAt: fmtDateTime(l.deliveryAt), href: `/loads/${l.id}` } : null,
            score: x.score, riskReasons: riskReasons(x, now), licenceExpires: fmtDate(x.licenseExpiry), medicalExpires: fmtDate(x.medicalExpiry), hired: fmtDate(x.hireDate),
          };
        });
        if (f.atRisk) rows = rows.filter((r) => r.riskReasons.length > 0);
        return { filters: f, ...capped(rows, "drivers") };
      },
    }),

    lateLoads: tool({
      description: "What is running late: in-transit loads whose ETA is after the delivery window (hours late), dispatched loads whose pickup time has passed without departing, and booked loads with pickup inside 24 hours that still have no truck or driver.",
      inputSchema: z.object({}),
      execute: async () => {
        const no = denied("lateLoads"); if (no) return no;
        const now = Date.now();
        const [transit, assigned, planned] = await Promise.all([
          db.load.findMany({ where: { status: "IN_TRANSIT" }, select: LOAD_ROW }),
          db.load.findMany({ where: { status: "ASSIGNED", pickupAt: { lt: new Date(now) } }, orderBy: { pickupAt: "asc" }, select: LOAD_ROW }),
          db.load.findMany({ where: { status: "PLANNED", pickupAt: { lte: new Date(now + DAY) } }, orderBy: { pickupAt: "asc" }, select: LOAD_ROW }),
        ]);
        const late = transit
          .map((l) => { const eta = estimatedArrival(l); const h = eta ? (eta.getTime() - l.deliveryAt.getTime()) / HOUR : 0; return { l, eta, hoursLate: round(h, 1) }; })
          .filter((x) => x.hoursLate > 0)
          .sort((a, b) => b.hoursLate - a.hoursLate)
          .map((x) => ({ ...loadView(x.l, { money }), eta: fmtDateTime(x.eta), hoursLate: x.hoursLate, progressPct: round(loadProgress(x.l, now) * 100) }));
        return {
          asOf: fmtDateTime(new Date()),
          runningLate: capped(late, "loads"),
          pickupOverdue: capped(assigned.map((l) => ({ ...loadView(l, { money }), hoursPastPickup: round((now - l.pickupAt.getTime()) / HOUR, 1) })), "loads"),
          unassignedWithin24h: capped(planned.map((l) => ({ ...loadView(l, { money }), hoursToPickup: round((l.pickupAt.getTime() - now) / HOUR, 1) })), "loads"),
          note: "ETA is a route estimate from departure time and distance at ~58 km/h average, unless a device ping is fresher.",
        };
      },
    }),

    loadsByStatus: tool({
      description: "Loads in one status with totals (count, km and, when permitted, revenue). Statuses: PLANNED (booked, not yet dispatched), ASSIGNED (dispatched), IN_TRANSIT, DELIVERED (not yet invoiced), INVOICED, CANCELLED, TONU (truck ordered, not used). Upcoming statuses sort soonest pickup first; finished ones most recent first.",
      inputSchema: z.object({
        status: z.enum(LOAD_STATUSES),
        customer: z.string().optional().describe("Customer or broker name (case-insensitive contains)"),
        days: z.number().int().min(1).max(365).optional().describe("Only loads with pickup in the last N days (default: all)"),
      }),
      execute: async (f) => {
        const no = denied("loadsByStatus"); if (no) return no;
        const upcoming = f.status === "PLANNED" || f.status === "ASSIGNED" || f.status === "IN_TRANSIT";
        const where: Prisma.LoadWhereInput = {
          status: f.status,
          ...(f.customer ? { OR: [{ customer: { name: like(f.customer) } }, { broker: { name: like(f.customer) } }] } : {}),
          ...(f.days ? { pickupAt: { gte: new Date(Date.now() - f.days * DAY) } } : {}),
        };
        const [rows, agg] = await Promise.all([
          db.load.findMany({ where, orderBy: { pickupAt: upcoming ? "asc" : "desc" }, take: LIMIT, select: LOAD_ROW }),
          db.load.aggregate({ where, _count: true, _sum: { rate: true, distanceKm: true } }),
        ]);
        return {
          status: loadLabel(f.status), filters: f,
          total: agg._count, showing: rows.length, truncated: agg._count > rows.length,
          totalKm: round(agg._sum.distanceKm ?? 0), ...(money ? { totalRateUsd: round(agg._sum.rate ?? 0) } : {}),
          loads: rows.map((l) => loadView(l, { money })),
        };
      },
    }),

    findLoad: tool({
      description: "Open one load by its reference (e.g. LD-10012) or customer reference number. Returns route, stops with arrival status, assignment, documents on file, billing stage, recent activity and (when permitted) money. If several match, returns the candidates instead.",
      inputSchema: z.object({ reference: z.string().min(2).describe("Load reference like LD-10012, or a customer / broker reference number") }),
      execute: async ({ reference }) => {
        const no = denied("findLoad"); if (no) return no;
        const q = reference.trim();
        let hits = await db.load.findMany({ where: { OR: [{ reference: { equals: q, mode: "insensitive" } }, { customerRef: { equals: q, mode: "insensitive" } }] }, select: { id: true }, take: 2 });
        if (hits.length !== 1) hits = await db.load.findMany({ where: { OR: [{ reference: like(q) }, { customerRef: like(q) }] }, select: { id: true }, take: 6, orderBy: { pickupAt: "desc" } });
        if (hits.length === 0) return { found: false, message: `No load matches "${q}". Check the reference or try searchEverything.` };
        if (hits.length > 1) {
          const rows = await db.load.findMany({ where: { id: { in: hits.map((h) => h.id) } }, select: LOAD_ROW, orderBy: { pickupAt: "desc" } });
          return { found: false, candidates: rows.map((l) => ({ reference: l.reference, customerRef: l.customerRef, status: loadLabel(l.status), route: `${l.originCity} → ${l.destCity}`, pickupAt: fmtDateTime(l.pickupAt), href: `/loads/${l.id}` })) };
        }
        const l = await db.load.findUniqueOrThrow({
          where: { id: hits[0].id },
          select: {
            ...LOAD_ROW, notes: true, podSignedBy: true, driverPay: true, fuelCost: true, otherCost: true, temperatureC: true, pallets: true,
            stops: { orderBy: { seq: "asc" }, select: { seq: true, type: true, name: true, city: true, windowStart: true, windowEnd: true, status: true, arrivedAt: true, departedAt: true } },
            events: { orderBy: { createdAt: "desc" }, take: 8, select: { type: true, message: true, createdAt: true, user: { select: { name: true } } } },
            invoice: { select: { id: true, number: true, status: true, amount: true, taxRate: true, dueAt: true, paidAt: true } },
            claims: { select: { id: true, number: true, status: true, type: true } },
            dispatcher: { select: { name: true } },
          },
        });
        const now = Date.now();
        const inTransit = l.status === "IN_TRANSIT";
        const eta = inTransit ? estimatedArrival(l) : null;
        const cost = l.driverPay + l.fuelCost + l.otherCost;
        return {
          found: true,
          ...loadView(l, { money }),
          origin: l.originName, destination: l.destName, dispatcher: l.dispatcher?.name ?? null, pallets: l.pallets, temperatureC: l.temperatureC, notes: l.notes, podSignedBy: l.podSignedBy,
          progressPct: inTransit ? round(loadProgress(l, now) * 100) : null, eta: fmtDateTime(eta),
          runningLate: Boolean(eta && eta.getTime() > l.deliveryAt.getTime()), hoursLate: eta && eta.getTime() > l.deliveryAt.getTime() ? round((eta.getTime() - l.deliveryAt.getTime()) / HOUR, 1) : 0,
          documentsOnFile: l.documents.map((x) => x.kind), missingBillingDocs: missingLoadDocs(l.documents),
          stops: l.stops.map((s) => ({ seq: s.seq, type: humanize(s.type), name: s.name, city: s.city, window: [fmtDateTime(s.windowStart), fmtDateTime(s.windowEnd)].filter(Boolean).join(" – ") || null, status: humanize(s.status), arrivedAt: fmtDateTime(s.arrivedAt), departedAt: fmtDateTime(s.departedAt) })),
          recentActivity: l.events.map((e) => ({ at: fmtDateTime(e.createdAt), type: humanize(e.type), message: e.message, by: e.user?.name ?? "system" })),
          claims: l.claims.map((c) => ({ number: c.number, type: label(CLAIM_TYPE_LABELS, c.type), status: humanize(c.status), href: `/claims/${c.id}` })),
          ...(money
            ? {
                money: {
                  rateUsd: round(l.rate), driverPayUsd: round(l.driverPay), fuelCostUsd: round(l.fuelCost), otherCostUsd: round(l.otherCost), marginUsd: round(l.rate - cost),
                  marginPct: l.rate ? round(((l.rate - cost) / l.rate) * 100) : null,
                  invoice: l.invoice ? { number: l.invoice.number, status: humanize(l.invoice.status), totalUsd: round(l.invoice.amount * (1 + l.invoice.taxRate)), dueAt: fmtDate(l.invoice.dueAt), paidAt: fmtDate(l.invoice.paidAt), href: `/finance/invoices/${l.invoice.id}` } : null,
                },
              }
            : {}),
        };
      },
    }),

    billingQueue: tool({
      description: "Finance: delivered loads not yet invoiced, split into 'ready to invoice' (RC and POD on file) and 'missing docs' (what is missing), with totals. Answers 'what can we invoice today'.",
      inputSchema: z.object({}),
      execute: async () => {
        const no = denied("billingQueue"); if (no) return no;
        const rows = await db.load.findMany({
          where: { billingStage: { in: ["MISSING_DOCS", "READY_TO_INVOICE"] } },
          orderBy: [{ deliveredAt: "asc" }, { deliveryAt: "asc" }],
          select: LOAD_ROW,
        });
        const now = Date.now();
        const view = (l: LoadRow) => ({
          reference: l.reference, href: `/loads/${l.id}`, customer: l.customer.name, billTo: l.broker?.name ?? l.customer.name, route: `${l.originCity} → ${l.destCity}`,
          deliveredAt: fmtDateTime(l.deliveredAt ?? l.deliveryAt), daysSinceDelivery: daysSince(l.deliveredAt ?? l.deliveryAt, now), rateUsd: round(l.rate), status: loadLabel(l.status),
          missingDocs: missingLoadDocs(l.documents),
        });
        const ready = rows.filter((l) => l.billingStage === "READY_TO_INVOICE").map(view);
        const missing = rows.filter((l) => l.billingStage === "MISSING_DOCS").map(view);
        const sum = (xs: { rateUsd: number }[]) => round(xs.reduce((a, x) => a + x.rateUsd, 0));
        return {
          asOf: fmtDateTime(new Date()),
          readyToInvoice: { count: ready.length, totalUsd: sum(ready), ...capped(ready, "loads") },
          missingDocs: { count: missing.length, totalUsd: sum(missing), ...capped(missing, "loads") },
          href: "/finance?tab=queue",
          note: "Invoices are raised from the load page or the finance queue; brokers are billed instead of shippers when a broker is on the load.",
        };
      },
    }),

    receivables: tool({
      description: "Finance: open receivables (sent invoices) with ageing buckets (current, 1–30, 31–60, 60+ days late), totals incl. VAT, and the most overdue invoices with customer and days late.",
      inputSchema: z.object({}),
      execute: async () => {
        const no = denied("receivables"); if (no) return no;
        const now = Date.now();
        const [aging, open, drafts] = await Promise.all([
          receivablesAging(),
          db.invoice.findMany({ where: { status: "SENT" }, orderBy: { dueAt: "asc" }, take: LIMIT, include: { customer: { select: { id: true, name: true } }, load: { select: { reference: true } } } }),
          db.invoice.count({ where: { status: "DRAFT" } }),
        ]);
        return {
          asOf: fmtDateTime(new Date()),
          openInvoices: aging.count, totalUsd: round(aging.total), overdueUsd: round(aging.overdue), draftInvoices: drafts,
          ageingUsd: Object.fromEntries(Object.entries(aging.aging).map(([k, v]) => [k, round(v)])),
          invoices: open.map((i) => {
            const late = Math.floor((now - i.dueAt.getTime()) / DAY);
            return { number: i.number, href: `/finance/invoices/${i.id}`, customer: i.customer.name, customerHref: `/customers/${i.customer.id}`, load: i.load?.reference ?? null, totalUsd: round(i.amount * (1 + i.taxRate)), issuedAt: fmtDate(i.issuedAt), dueAt: fmtDate(i.dueAt), daysLate: Math.max(0, late), overdue: late > 0 };
          }),
          truncated: aging.count > open.length, href: "/finance?tab=aging",
        };
      },
    }),

    openClaims: tool({
      description: "Open claims (reported, under review, docs collected, submitted, negotiation, disputed, litigation): number, type, severity, status, days open, fault, amount claimed, driver, load, unit. Oldest first.",
      inputSchema: z.object({ severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional() }),
      execute: async (f) => {
        const no = denied("openClaims"); if (no) return no;
        const now = Date.now();
        const where: Prisma.ClaimWhereInput = { status: { in: [...CLAIM_OPEN_STATUSES] }, ...(f.severity ? { severity: f.severity } : {}) };
        const [rows, total, sum] = await Promise.all([
          db.claim.findMany({ where, orderBy: { createdAt: "asc" }, take: LIMIT, include: { driver: { select: { name: true } }, load: { select: { reference: true } }, truck: { select: { unitNumber: true } }, trailer: { select: { unitNumber: true } }, customer: { select: { name: true } }, assignedTo: { select: { name: true } } } }),
          db.claim.count({ where }),
          db.claim.aggregate({ where, _sum: { amountClaimed: true } }),
        ]);
        return {
          total, showing: rows.length, truncated: total > rows.length, totalClaimedUsd: round(sum._sum.amountClaimed ?? 0),
          claims: rows.map((c) => ({
            number: c.number, href: `/claims/${c.id}`, type: label(CLAIM_TYPE_LABELS, c.type), severity: humanize(c.severity), status: humanize(c.status),
            incidentAt: fmtDate(c.incidentAt), daysOpen: daysSince(c.createdAt, now), fault: label(CLAIM_FAULT_LABELS, c.fault), amountClaimedUsd: round(c.amountClaimed),
            driver: c.driver?.name ?? null, load: c.load?.reference ?? null, unit: c.truck?.unitNumber ?? c.trailer?.unitNumber ?? null, customer: c.customer?.name ?? null, assignedTo: c.assignedTo?.name ?? null,
            location: c.location, summary: c.description.length > 160 ? `${c.description.slice(0, 157)}…` : c.description,
          })),
        };
      },
    }),

    maintenanceDue: tool({
      description: "Trucks due or overdue for service by odometer (next service km minus current km), sorted most urgent first, plus units currently in the shop with open work orders. withinKm defaults to 2000.",
      inputSchema: z.object({ withinKm: z.number().int().min(0).max(100_000).optional().describe("Include trucks with service due inside this many km (default 2000). Overdue trucks are always included.") }),
      execute: async ({ withinKm }) => {
        const no = denied("maintenanceDue"); if (no) return no;
        const horizon = withinKm ?? PM_DUE_SOON_KM;
        const now = Date.now();
        const [trucks, inShop, openWo] = await Promise.all([
          db.truck.findMany({ where: { status: { not: "INACTIVE" } }, orderBy: { unitNumber: "asc" }, select: TRUCK_ROW }),
          db.workOrder.findMany({ where: { status: "IN_PROGRESS" }, orderBy: { inAt: "asc" }, take: LIMIT, include: { truck: { select: { id: true, unitNumber: true } }, trailer: { select: { unitNumber: true } } } }),
          db.workOrder.count({ where: { status: { in: ["OPEN", "DRAFT"] } } }),
        ]);
        const due = trucks
          .map((t) => truckView(t, now))
          .filter((t) => t.service.kmLeft != null && t.service.kmLeft < horizon)
          .sort((a, b) => (a.service.kmLeft ?? 0) - (b.service.kmLeft ?? 0))
          .map((t) => ({ unit: t.unit, href: t.href, vehicle: t.vehicle, status: t.status, driver: t.driver?.name ?? null, odometerKm: t.odometerKm, nextServiceKm: t.service.nextServiceKm, kmLeft: t.service.kmLeft, state: t.service.state, lastPmAt: t.service.lastPmAt, currentLoad: t.currentLoad?.reference ?? null, location: t.location }));
        return {
          withinKm: horizon, overdue: due.filter((t) => t.state === "overdue").length, dueSoon: due.filter((t) => t.state === "due soon").length,
          noServiceData: trucks.filter((t) => pmStatus(t).state === "unknown").length,
          ...capped(due, "trucks"),
          inShop: inShop.map((w) => ({ workOrder: `WO-${w.number}`, unit: w.truck?.unitNumber ?? w.trailer?.unitNumber ?? null, href: w.truck ? `/fleet/${w.truck.id}` : "/maintenance", title: w.title, category: humanize(w.category), priority: humanize(w.priority), vendor: w.vendor, inShopSince: fmtDate(w.inAt ?? w.scheduledAt), daysInShop: daysSince(w.inAt ?? w.scheduledAt, now) })),
          openWorkOrdersNotStarted: openWo, href: "/maintenance",
        };
      },
    }),

    weeklyProduction: tool({
      description: "Weekly production board: revenue, km and revenue per km per team and per driver for one week (Monday start), against weekly goals, with efficiency % (= revenue / goal). Defaults to the current week. Loads count on their pickup day.",
      inputSchema: z.object({ weekStart: z.string().optional().describe("Any date inside the week, YYYY-MM-DD. Defaults to today.") }),
      execute: async ({ weekStart }) => {
        const no = denied("weeklyProduction"); if (no) return no;
        const anchor = weekStart && !Number.isNaN(Date.parse(weekStart)) ? new Date(weekStart) : new Date();
        const w = await weeklyProduction(startOfWeek(anchor, { weekStartsOn: 1 }));
        const drivers = w.groups.flatMap((g) => g.rows.map((r) => ({
          driver: r.driver.name, href: `/drivers/${r.driver.id}`, team: g.team.name, type: label(DRIVER_TYPE_LABELS, r.driver.type), truck: r.driver.truck, hold: r.driver.hold,
          revenueUsd: round(r.total), km: round(r.km), revenuePerKm: r.rpk, goalUsd: r.goal, vsGoalUsd: round(r.planDelta), efficiencyPct: r.efficiency, daysWorked: r.daysWorked, loads: r.days.reduce((a, c) => a + c.loads.length, 0),
        }))).sort((a, b) => b.revenueUsd - a.revenueUsd);
        return {
          week: `${fmtDate(w.start)} – ${fmtDate(new Date(w.end.getTime() - DAY))}`, goalsUsd: { soloCompanyDriver: w.goals.solo, ownerOrLeaseOperator: w.goals.team },
          fleetTotals: { revenueUsd: round(w.grand.total), km: round(w.grand.km), drivers: w.grand.drivers, avgPerTruckUsd: w.grand.avgPerTruck, revenuePerKm: w.grand.rpk },
          teams: w.groups.map((g) => ({ team: g.team.name, drivers: g.rows.length, revenueUsd: round(g.total), km: round(g.km), avgPerTruckUsd: g.avgPerTruck, efficiencyPct: g.efficiency })),
          belowGoal: drivers.filter((x) => x.vsGoalUsd < 0).length,
          ...capped(drivers, "drivers"), href: "/dispatch/weekly",
        };
      },
    }),

    alerts: tool({
      description: "Operational alerts that need a human, critical first: compliance (expiring licences, insurance, inspections, missing paperwork), dispatch (late or unassigned loads, idle drivers), fleet (service due, trailers stuck in shop), money (overdue invoices, no rate confirmation, lease caps) and safety (old open claims).",
      inputSchema: z.object({ kind: z.enum(["compliance", "dispatch", "fleet", "money", "safety"]).optional(), level: z.enum(["critical", "warning"]).optional() }),
      execute: async (f) => {
        const no = denied("alerts"); if (no) return no;
        const all = await getAlerts();
        const visible = all.filter((a) => (a.kind !== "money" || money) && (!f.kind || a.kind === f.kind) && (!f.level || a.level === f.level));
        const by = <K extends string>(key: (a: (typeof all)[number]) => K) => visible.reduce<Record<string, number>>((m, a) => { m[key(a)] = (m[key(a)] ?? 0) + 1; return m; }, {});
        return { asOf: fmtDateTime(new Date()), byLevel: by((a) => a.level), byKind: by((a) => a.kind), ...capped(visible, "alerts"), href: "/dashboard" };
      },
    }),

    searchEverything: tool({
      description: "Free-text search across loads, drivers, trucks, trailers, customers and (when permitted) invoices — by reference, name, unit number, plate, city or commodity. Use when you do not know what kind of thing the user means. Up to 5 hits per type.",
      inputSchema: z.object({ q: z.string().min(2).describe("Search text, at least 2 characters") }),
      execute: async ({ q }) => {
        const no = denied("searchEverything"); if (no) return no;
        const t = q.trim();
        const [loads, drivers, trucks, trailers, customers, invoices] = await Promise.all([
          can(ctx.role, "loads.view") ? db.load.findMany({ where: { OR: [{ reference: like(t) }, { customerRef: like(t) }, { originCity: like(t) }, { destCity: like(t) }, { commodity: like(t) }, { customer: { name: like(t) } }] }, take: 5, orderBy: { pickupAt: "desc" }, select: LOAD_ROW }) : [],
          can(ctx.role, "drivers.view") ? db.driver.findMany({ where: { OR: [{ name: like(t) }, { phone: like(t) }] }, take: 5, select: { id: true, name: true, phone: true, status: true, boardStatus: true, hold: true, truck: { select: { unitNumber: true } } } }) : [],
          can(ctx.role, "fleet.view") ? db.truck.findMany({ where: { OR: [{ unitNumber: like(t) }, { plate: like(t) }, { make: like(t) }, { model: like(t) }, { locationName: like(t) }] }, take: 5, select: { id: true, unitNumber: true, make: true, model: true, status: true, locationName: true, driver: { select: { name: true } } } }) : [],
          can(ctx.role, "fleet.view") ? db.trailer.findMany({ where: { OR: [{ unitNumber: like(t) }, { plate: like(t) }] }, take: 5, select: { unitNumber: true, type: true, status: true, locationName: true, truck: { select: { unitNumber: true } } } }) : [],
          can(ctx.role, "customers.view") ? db.customer.findMany({ where: { OR: [{ name: like(t) }, { contactName: like(t) }, { city: like(t) }] }, take: 5, select: { id: true, name: true, kind: true, contactName: true, phone: true, city: true, paymentTerms: true } }) : [],
          money ? db.invoice.findMany({ where: { OR: [{ number: like(t) }, { customer: { name: like(t) } }] }, take: 5, include: { customer: { select: { name: true } } } }) : [],
        ]);
        return {
          query: t,
          loads: loads.map((l) => ({ reference: l.reference, status: loadLabel(l.status), customer: l.customer.name, route: `${l.originCity} → ${l.destCity}`, pickupAt: fmtDateTime(l.pickupAt), driver: l.driver?.name ?? null, truck: l.truck?.unitNumber ?? null, href: `/loads/${l.id}` })),
          drivers: drivers.map((x) => ({ name: x.name, phone: x.phone, employment: humanize(x.status), boardStatus: boardLabel(x.boardStatus), hold: x.hold, truck: x.truck?.unitNumber ?? null, href: `/drivers/${x.id}` })),
          trucks: trucks.map((x) => ({ unit: x.unitNumber, vehicle: `${x.make} ${x.model}`, status: x.status === "MAINTENANCE" ? "In shop" : humanize(x.status), driver: x.driver?.name ?? null, location: x.locationName, href: `/fleet/${x.id}` })),
          trailers: trailers.map((x) => ({ unit: x.unitNumber, type: humanize(x.type), status: label(TRAILER_STATUS_LABELS, x.status), pairedTruck: x.truck?.unitNumber ?? null, location: x.locationName, href: "/fleet/trailers" })),
          customers: customers.map((c) => ({ name: c.name, kind: humanize(c.kind), contact: c.contactName, phone: c.phone, city: c.city, paymentTermsDays: c.paymentTerms, href: `/customers/${c.id}` })),
          invoices: invoices.map((i) => ({ number: i.number, customer: i.customer.name, status: humanize(i.status), totalUsd: round(i.amount * (1 + i.taxRate)), dueAt: fmtDate(i.dueAt), href: `/finance/invoices/${i.id}` })),
        };
      },
    }),
  };
}

export type AssistantTools = ReturnType<typeof buildAssistantTools>;
