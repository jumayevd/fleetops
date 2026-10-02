import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { TIMEZONE } from "@/lib/constants";
import { estimatedArrival, loadProgress, syncSimulatedPositions } from "@/lib/telemetry";
import { isRowColor, type BoardLoad, type BoardPayload, type BoardRow, type StatusEvent } from "./types";

const DAY = 86_400_000;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

/* ------------------------------------------------------------------ */
/* Dates (company timezone)                                            */
/* ------------------------------------------------------------------ */

function tzOffsetMs(at: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at);
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - at.getTime();
}

/** Today's date (YYYY-MM-DD) in the company timezone. */
export function todayYmd() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** `date` query param → YYYY-MM-DD, falling back to today. */
export function parseBoardDate(v: unknown) {
  return typeof v === "string" && YMD.test(v) && !Number.isNaN(Date.parse(v)) ? v : todayYmd();
}

/** [start, end) of a calendar day in the company timezone. */
export function dayRange(ymd: string) {
  const utcMidnight = new Date(`${ymd}T00:00:00Z`);
  const start = new Date(utcMidnight.getTime() - tzOffsetMs(utcMidnight, TIMEZONE));
  return { start, end: new Date(start.getTime() + DAY) };
}

/** Key for BoardCell.date (`@db.Date`): UTC midnight of the calendar date, matching how cells are seeded. */
export const cellDate = (ymd: string) => new Date(`${ymd}T00:00:00.000Z`);

export const shiftYmd = (ymd: string, days: number) => new Date(Date.parse(`${ymd}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);

/* ------------------------------------------------------------------ */
/* Rows                                                                */
/* ------------------------------------------------------------------ */

const loadSelect = {
  id: true, reference: true, status: true, priority: true, originCity: true, destCity: true, pickupAt: true, deliveryAt: true,
  departedAt: true, deliveredAt: true, distanceKm: true, trailerId: true, driverId: true,
  customer: { select: { name: true } },
  trailer: { select: { id: true, unitNumber: true, type: true } },
  documents: { select: { kind: true } },
  stops: { orderBy: { seq: "asc" as const }, select: { type: true, name: true, city: true, status: true, windowStart: true, windowEnd: true } },
} satisfies Prisma.LoadSelect;

type LoadRecord = Prisma.LoadGetPayload<{ select: typeof loadSelect }>;

const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;

function toBoardLoad(l: LoadRecord, now: number): BoardLoad {
  const inTransit = l.status === "IN_TRANSIT";
  const progress = inTransit ? loadProgress(l, now) : 0;
  const eta = inTransit ? estimatedArrival(l) : null;
  const next = l.stops.find((s) => s.status !== "DONE") ?? null;
  return {
    id: l.id, reference: l.reference, status: l.status, customer: l.customer.name, originCity: l.originCity, destCity: l.destCity,
    pickupAt: l.pickupAt.toISOString(), deliveryAt: l.deliveryAt.toISOString(), departedAt: iso(l.departedAt), deliveredAt: iso(l.deliveredAt),
    distanceKm: l.distanceKm, progress, eta: iso(eta),
    late: Boolean(eta && eta.getTime() > l.deliveryAt.getTime()),
    latePickup: l.status === "ASSIGNED" && l.pickupAt.getTime() < now,
    hasRc: l.documents.some((d) => d.kind === "RC"),
    priority: l.priority,
    nextStop: next ? { type: next.type, name: next.name, city: next.city, status: next.status, windowStart: iso(next.windowStart), windowEnd: iso(next.windowEnd) } : null,
    stopsDone: l.stops.filter((s) => s.status === "DONE").length,
    stopsTotal: l.stops.length,
  };
}

/** Prefer the load that is actually moving, then the one dispatched, then whatever is left. */
const LOAD_RANK: Record<string, number> = { IN_TRANSIT: 0, ASSIGNED: 1, PLANNED: 2, DELIVERED: 3, INVOICED: 4, TONU: 5, CANCELLED: 6 };
const rankLoad = (l: LoadRecord) => LOAD_RANK[l.status] ?? 9;

/**
 * Every active driver as a board row for `ymd`. Today shows the live active load (dispatched / in transit);
 * other dates show the load whose pickup or delivery falls on that day plus the saved cells for that day.
 * Past dates reconstruct each driver's status from the status history.
 */
export async function loadBoardRows(ymd: string, opts: { teamId?: string | null } = {}): Promise<BoardPayload> {
  const today = ymd === todayYmd();
  const { start, end } = dayRange(ymd);
  const now = Date.now();
  if (today) await syncSimulatedPositions();

  const teamFilter: Prisma.DriverWhereInput = opts.teamId === undefined || opts.teamId === null ? {} : opts.teamId === "none" ? { teamId: null } : { teamId: opts.teamId };

  const [drivers, loads, cells, history] = await Promise.all([
    db.driver.findMany({
      where: { status: { not: "INACTIVE" }, ...teamFilter },
      orderBy: [{ team: { sortOrder: "asc" } }, { name: "asc" }],
      select: {
        id: true, name: true, phone: true, phone2: true, type: true, hold: true, holdReason: true, status: true,
        boardStatus: true, boardStatusSince: true, boardStatusManual: true,
        team: { select: { id: true, name: true, color: true } },
        truck: {
          select: {
            id: true, unitNumber: true, locationName: true, fuelPct: true, lastPingAt: true, speedKmh: true,
            trailers: { select: { id: true, unitNumber: true, type: true }, take: 1, orderBy: { unitNumber: "asc" } },
          },
        },
      },
    }),
    db.load.findMany({
      where: today
        ? { driverId: { not: null }, status: { in: ["ASSIGNED", "IN_TRANSIT"] } }
        : { driverId: { not: null }, status: { not: "CANCELLED" }, OR: [{ pickupAt: { gte: start, lt: end } }, { deliveryAt: { gte: start, lt: end } }] },
      select: loadSelect,
    }),
    db.boardCell.findMany({ where: { date: cellDate(ymd) }, select: { driverId: true, column: true, color: true, note: true } }),
    today || end.getTime() > now
      ? Promise.resolve([])
      : db.driverStatusEvent.findMany({ where: { at: { lt: end } }, orderBy: { at: "desc" }, distinct: ["driverId"], select: { driverId: true, status: true, source: true, at: true } }),
  ]);

  const loadByDriver = new Map<string, LoadRecord>();
  for (const l of loads) {
    const cur = loadByDriver.get(l.driverId!);
    if (!cur || rankLoad(l) < rankLoad(cur)) loadByDriver.set(l.driverId!, l);
  }
  const cellBy = new Map<string, { color: string | null; note: string | null }>();
  for (const c of cells) {
    const e = cellBy.get(c.driverId) ?? { color: null, note: null };
    if (c.column === "row") e.color = c.color;
    if (c.column === "notes") e.note = c.note;
    cellBy.set(c.driverId, e);
  }
  const histBy = new Map(history.map((h) => [h.driverId, h]));
  const past = !today && end.getTime() <= now;

  const rows: BoardRow[] = drivers.map((d) => {
    const l = loadByDriver.get(d.id);
    const h = past ? histBy.get(d.id) : undefined;
    const cell = cellBy.get(d.id);
    return {
      driver: { id: d.id, name: d.name, phone: d.phone, phone2: d.phone2, type: d.type, hold: d.hold, holdReason: d.holdReason, employment: d.status },
      team: d.team,
      status: h?.status ?? d.boardStatus,
      statusSince: (h?.at ?? d.boardStatusSince).toISOString(),
      statusManual: h ? h.source === "MANUAL" : d.boardStatusManual,
      statusMode: today ? "live" : past ? "history" : "projected",
      truck: d.truck
        ? { id: d.truck.id, unitNumber: d.truck.unitNumber, locationName: d.truck.locationName, fuelPct: d.truck.fuelPct, lastPingAt: iso(d.truck.lastPingAt), speedKmh: d.truck.speedKmh }
        : null,
      trailer: l?.trailer ?? d.truck?.trailers[0] ?? null,
      load: l ? toBoardLoad(l, now) : null,
      cell: { color: isRowColor(cell?.color) ? cell!.color : null, note: cell?.note ?? null },
    };
  });

  return { date: ymd, today, rows, at: new Date(now).toISOString() };
}

/** Status history for the drawer, newest first. */
export async function driverStatusHistory(driverId: string, take = 60): Promise<StatusEvent[]> {
  const events = await db.driverStatusEvent.findMany({
    where: { driverId }, orderBy: { at: "desc" }, take,
    select: { id: true, status: true, source: true, note: true, at: true, user: { select: { name: true } } },
  });
  return events.map((e) => ({ id: e.id, status: e.status, source: e.source, note: e.note, user: e.user?.name ?? null, at: e.at.toISOString() }));
}

/** Loads for the prebook view: booked or dispatched with a pickup more than 24 h out. */
export async function prebookLoads() {
  const horizon = new Date(Date.now() + DAY);
  return db.load.findMany({
    where: { status: { in: ["PLANNED", "ASSIGNED"] }, pickupAt: { gt: horizon } },
    orderBy: { pickupAt: "asc" },
    include: {
      customer: { select: { name: true } },
      team: { select: { id: true, name: true, color: true } },
      driver: { select: { id: true, name: true, type: true, hold: true } },
      truck: { select: { id: true, unitNumber: true } },
      documents: { select: { kind: true } },
    },
  });
}
