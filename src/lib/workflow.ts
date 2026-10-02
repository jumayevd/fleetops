import "server-only";
import { after } from "next/server";
import { db } from "./db";
import { audit } from "./audit";
import { FormError } from "./action";
import {
  BOARD_STATUS_LABELS, LOAD_STATUS_LABELS, LOAD_TRANSITIONS, MANUAL_BOARD_STATUSES, REQUIRED_LOAD_DOCS,
  type BillingStage, type BoardStatus, type LoadStatus,
} from "./constants";
import { notifyLoadStatus } from "./notify";

const DAY = 86_400_000;

/* ------------------------------------------------------------------ */
/* Numbering                                                           */
/* ------------------------------------------------------------------ */

async function nextNumber(prefix: string, start: number, fetchLast: () => Promise<string | null>) {
  const last = await fetchLast();
  const n = last ? Number(last.replace(/\D/g, "")) + 1 : start;
  return `${prefix}-${n}`;
}
export const nextInvoiceNumber = () =>
  nextNumber("INV", 5001, async () => (await db.invoice.findFirst({ orderBy: { number: "desc" }, select: { number: true } }))?.number ?? null);
export const nextLoadReference = () =>
  nextNumber("LD", 10001, async () => (await db.load.findFirst({ orderBy: { reference: "desc" }, select: { reference: true } }))?.reference ?? null);
export const nextClaimNumber = () =>
  nextNumber("CLM", 1001, async () => (await db.claim.findFirst({ orderBy: { number: "desc" }, select: { number: true } }))?.number ?? null);

/* ------------------------------------------------------------------ */
/* Billing stage                                                       */
/* ------------------------------------------------------------------ */

export function missingLoadDocs(docs: { kind: string }[]) {
  const kinds = new Set(docs.map((d) => d.kind));
  return REQUIRED_LOAD_DOCS.filter((k) => !kinds.has(k));
}

export async function computeBillingStage(loadId: string): Promise<BillingStage> {
  const load = await db.load.findUniqueOrThrow({
    where: { id: loadId },
    include: { invoice: { select: { status: true } }, documents: { select: { kind: true } } },
  });
  if (load.invoice?.status === "PAID") return "PAID";
  if (load.invoice || load.status === "INVOICED") return "INVOICED";
  if (load.status !== "DELIVERED" && load.status !== "TONU") return "NONE";
  return missingLoadDocs(load.documents).length ? "MISSING_DOCS" : "READY_TO_INVOICE";
}

/** Re-derive the billing stage (after status changes, document uploads, payments). Logs a BILLING event when it moves. */
export async function recomputeBillingStage(loadId: string, userId: string | null = null) {
  const stage = await computeBillingStage(loadId);
  const load = await db.load.findUniqueOrThrow({ where: { id: loadId }, select: { billingStage: true, documents: { select: { kind: true } } } });
  if (load.billingStage !== stage) {
    await db.load.update({ where: { id: loadId }, data: { billingStage: stage } });
    const missing = stage === "MISSING_DOCS" ? ` · missing ${missingLoadDocs(load.documents).join(", ")}` : "";
    await db.loadEvent.create({ data: { loadId, type: "BILLING", message: `Billing: ${humanStage(load.billingStage)} → ${humanStage(stage)}${missing}`, userId } });
  }
  return stage;
}
const humanStage = (s: string) => s.toLowerCase().replace(/_/g, " ");

export async function createInvoiceForLoad(loadId: string, userId: string | null) {
  const load = await db.load.findUniqueOrThrow({ where: { id: loadId }, include: { customer: true, broker: true, invoice: true } });
  if (load.invoice) return load.invoice;
  const billTo = load.broker ?? load.customer; // brokers pay carriers; shippers pay direct
  const invoice = await db.invoice.create({
    data: {
      number: await nextInvoiceNumber(),
      customerId: billTo.id,
      loadId: load.id,
      amount: load.rate,
      status: "DRAFT",
      dueAt: new Date(Date.now() + billTo.paymentTerms * DAY),
    },
  });
  await db.load.update({ where: { id: loadId }, data: { billingStage: "INVOICED" } });
  await audit(userId, "create", "invoice", invoice.id, `${invoice.number} for ${load.reference}`);
  return invoice;
}

/* ------------------------------------------------------------------ */
/* Driver board status                                                 */
/* ------------------------------------------------------------------ */

type LoadForBoard = { status: string; stops?: { type: string; status: string; seq: number }[] } | null | undefined;

/** Board status derived from the driver's active load and its stop progress. */
export function deriveBoardStatus(load: LoadForBoard): BoardStatus {
  if (!load) return "READY";
  if (load.status === "ASSIGNED") return "DISPATCHED";
  if (load.status === "IN_TRANSIT") {
    const current = [...(load.stops ?? [])].sort((a, b) => a.seq - b.seq).find((s) => s.status !== "DONE");
    if (current?.status === "ARRIVED") return current.type === "PICKUP" ? "AT_PICKUP" : "UNLOADING";
    return "EN_ROUTE";
  }
  return "READY";
}

/** Recompute a driver's board status from their loads, unless a dispatcher override is active (or `force`). */
export async function syncDriverBoardStatus(driverId: string, userId: string | null = null, opts: { force?: boolean } = {}) {
  const driver = await db.driver.findUnique({
    where: { id: driverId },
    include: { loads: { where: { status: { in: ["ASSIGNED", "IN_TRANSIT"] } }, orderBy: { status: "desc" }, include: { stops: true }, take: 1 } },
  });
  if (!driver) return;
  if (driver.boardStatusManual && !opts.force) return;
  const next = deriveBoardStatus(driver.loads[0]);
  if (next !== driver.boardStatus || driver.boardStatusManual) {
    await db.driver.update({ where: { id: driverId }, data: { boardStatus: next, boardStatusSince: new Date(), boardStatusManual: false } });
    await db.driverStatusEvent.create({ data: { driverId, status: next, source: "AUTO", userId } });
  }
}

/** Dispatcher override: STOP / REST / HOME / VACATION (or READY to park a driver). */
export async function setDriverBoardStatus(driverId: string, status: BoardStatus, userId: string | null, note?: string | null) {
  if (!MANUAL_BOARD_STATUSES.includes(status)) {
    throw new FormError(`${BOARD_STATUS_LABELS[status]} is set automatically from the driver's load`);
  }
  const driver = await db.driver.update({
    where: { id: driverId },
    data: { boardStatus: status, boardStatusSince: new Date(), boardStatusManual: true },
  });
  await db.driverStatusEvent.create({ data: { driverId, status, source: "MANUAL", userId, note } });
  await audit(userId, "board_status", "driver", driverId, `${driver.name} → ${BOARD_STATUS_LABELS[status]}${note ? ` (${note})` : ""}`);
}

export async function clearDriverBoardOverride(driverId: string, userId: string | null) {
  await syncDriverBoardStatus(driverId, userId, { force: true });
}

/* ------------------------------------------------------------------ */
/* Availability                                                        */
/* ------------------------------------------------------------------ */

/** Validate a truck/driver/trailer isn't already committed to another active load. */
export async function assertAvailable(loadId: string | null, ids: { truckId?: string | null; driverId?: string | null; trailerId?: string | null }) {
  const active = { in: ["ASSIGNED", "IN_TRANSIT"] };
  const notThis = loadId ? { id: { not: loadId } } : {};
  if (ids.truckId) {
    const truck = await db.truck.findUnique({ where: { id: ids.truckId } });
    if (!truck) throw new FormError("Truck not found");
    if (truck.status !== "ACTIVE") throw new FormError(`${truck.unitNumber} is not active (${truck.status.toLowerCase().replace(/_/g, " ")})`);
    const busy = await db.load.findFirst({ where: { truckId: ids.truckId, status: active, ...notThis } });
    if (busy) throw new FormError(`${truck.unitNumber} is already on ${busy.reference}`);
  }
  if (ids.driverId) {
    const driver = await db.driver.findUnique({ where: { id: ids.driverId } });
    if (!driver) throw new FormError("Driver not found");
    if (driver.status !== "ACTIVE") throw new FormError(`${driver.name} is ${driver.status.toLowerCase().replace(/_/g, " ")}`);
    if (driver.hold) throw new FormError(`${driver.name} is on hold${driver.holdReason ? `: ${driver.holdReason}` : ""}`);
    if (driver.boardStatus === "VACATION") throw new FormError(`${driver.name} is on vacation`);
    if (driver.licenseExpiry < new Date()) throw new FormError(`${driver.name}'s license has expired`);
    const busy = await db.load.findFirst({ where: { driverId: ids.driverId, status: active, ...notThis } });
    if (busy) throw new FormError(`${driver.name} is already on ${busy.reference}`);
  }
  if (ids.trailerId) {
    const trailer = await db.trailer.findUnique({ where: { id: ids.trailerId } });
    if (!trailer) throw new FormError("Trailer not found");
    if (["SHOP", "OUT_OF_SERVICE"].includes(trailer.status)) throw new FormError(`${trailer.unitNumber} is ${trailer.status.toLowerCase().replace(/_/g, " ")}`);
    const busy = await db.load.findFirst({ where: { trailerId: ids.trailerId, status: active, ...notThis } });
    if (busy) throw new FormError(`${trailer.unitNumber} is already on ${busy.reference}`);
  }
}

/* ------------------------------------------------------------------ */
/* Stops                                                               */
/* ------------------------------------------------------------------ */

export async function arriveAtStop(loadId: string, stopId: string, userId: string | null, pos?: { lat?: number; lng?: number }) {
  const stop = await db.stop.findUniqueOrThrow({ where: { id: stopId } });
  if (stop.loadId !== loadId) throw new FormError("Stop does not belong to this load");
  if (stop.status !== "PENDING") throw new FormError("Already arrived at this stop");
  const now = new Date();
  await db.stop.update({ where: { id: stopId }, data: { status: "ARRIVED", arrivedAt: now } });
  await db.loadEvent.create({ data: { loadId, type: "STATUS", message: `Arrived at ${stop.type === "PICKUP" ? "pickup" : "delivery"}: ${stop.name}`, userId, lat: pos?.lat, lng: pos?.lng } });
  const load = await db.load.findUniqueOrThrow({ where: { id: loadId }, select: { driverId: true } });
  if (load.driverId) await syncDriverBoardStatus(load.driverId, userId);
}

/** Mark a stop done. Returns true when it was the final delivery (caller may then deliver the load). */
export async function completeStop(loadId: string, stopId: string, userId: string | null, pos?: { lat?: number; lng?: number }) {
  const stop = await db.stop.findUniqueOrThrow({ where: { id: stopId } });
  if (stop.loadId !== loadId) throw new FormError("Stop does not belong to this load");
  const now = new Date();
  await db.stop.update({ where: { id: stopId }, data: { status: "DONE", arrivedAt: stop.arrivedAt ?? now, departedAt: now } });
  await db.loadEvent.create({ data: { loadId, type: "STATUS", message: `${stop.type === "PICKUP" ? "Loaded" : "Unloaded"} at ${stop.name}`, userId, lat: pos?.lat, lng: pos?.lng } });
  const remaining = await db.stop.count({ where: { loadId, status: { not: "DONE" } } });
  const load = await db.load.findUniqueOrThrow({ where: { id: loadId }, select: { driverId: true } });
  if (load.driverId) await syncDriverBoardStatus(load.driverId, userId);
  return remaining === 0;
}

/* ------------------------------------------------------------------ */
/* Load status                                                         */
/* ------------------------------------------------------------------ */

export async function transitionLoad(loadId: string, to: LoadStatus, userId: string | null, opts: { podSignedBy?: string | null; lat?: number; lng?: number; reason?: string | null } = {}) {
  const load = await db.load.findUniqueOrThrow({ where: { id: loadId }, include: { stops: { orderBy: { seq: "asc" } } } });
  const from = load.status as LoadStatus;
  if (!LOAD_TRANSITIONS[from].includes(to)) {
    throw new FormError(`Cannot move a load from ${LOAD_STATUS_LABELS[from]} to ${LOAD_STATUS_LABELS[to]}`);
  }
  const now = new Date();
  let message = `Status: ${LOAD_STATUS_LABELS[from]} → ${LOAD_STATUS_LABELS[to]}`;

  switch (to) {
    case "ASSIGNED":
      if (!load.truckId || !load.driverId) throw new FormError("Assign a truck and driver first");
      if (load.trailerId) await db.trailer.update({ where: { id: load.trailerId }, data: { status: "IN_USE", statusSince: now, truckId: load.truckId } });
      break;
    case "IN_TRANSIT": {
      if (!load.truckId || !load.driverId) throw new FormError("Assign a truck and driver first");
      await db.load.update({ where: { id: loadId }, data: { departedAt: now } });
      const firstPickup = load.stops.find((s) => s.type === "PICKUP");
      if (firstPickup && firstPickup.status !== "DONE") {
        await db.stop.update({ where: { id: firstPickup.id }, data: { status: "DONE", arrivedAt: firstPickup.arrivedAt ?? now, departedAt: now } });
      }
      await db.truck.update({ where: { id: load.truckId }, data: { lat: load.originLat, lng: load.originLng, lastPingAt: now, engineOn: true } });
      if (load.trailerId) await db.trailer.update({ where: { id: load.trailerId }, data: { status: "IN_USE", statusSince: now, truckId: load.truckId } });
      message = `Picked up at ${load.originName} — in transit`;
      break;
    }
    case "DELIVERED":
      await db.load.update({ where: { id: loadId }, data: { deliveredAt: now, podSignedBy: opts.podSignedBy ?? null } });
      await db.stop.updateMany({ where: { loadId, status: { not: "DONE" } }, data: { status: "DONE", arrivedAt: now, departedAt: now } });
      if (load.truckId) {
        await db.truck.update({
          where: { id: load.truckId },
          data: { lat: load.destLat, lng: load.destLng, speedKmh: 0, engineOn: false, lastPingAt: now, odometerKm: { increment: Math.round(load.distanceKm + load.emptyKm) } },
        });
      }
      if (load.trailerId) await db.trailer.update({ where: { id: load.trailerId }, data: { status: "EMPTY", statusSince: now, lat: load.destLat, lng: load.destLng, locationName: load.destCity } });
      message = `Delivered to ${load.destName}${opts.podSignedBy ? ` — POD signed by ${opts.podSignedBy}` : ""}`;
      break;
    case "INVOICED":
      await createInvoiceForLoad(loadId, userId);
      message = "Invoice generated";
      break;
    case "TONU":
      if (load.trailerId) await db.trailer.update({ where: { id: load.trailerId }, data: { status: "EMPTY", statusSince: now } });
      message = `Truck ordered, not used${opts.reason ? ` — ${opts.reason}` : ""}`;
      break;
    case "CANCELLED":
    case "PLANNED":
      if (load.trailerId && from === "ASSIGNED") await db.trailer.update({ where: { id: load.trailerId }, data: { status: "EMPTY", statusSince: now } });
      if (to === "PLANNED" && from === "ASSIGNED") {
        await db.load.update({ where: { id: loadId }, data: { truckId: null, driverId: null, trailerId: null } });
        message = "Unassigned — back to planning";
      }
      if (to === "CANCELLED" && opts.reason) message += ` — ${opts.reason}`;
      break;
  }

  await db.load.update({ where: { id: loadId }, data: { status: to } });
  await db.loadEvent.create({ data: { loadId, type: "STATUS", message, userId, lat: opts.lat, lng: opts.lng } });
  if (load.driverId) await syncDriverBoardStatus(load.driverId, userId, { force: true });
  if (["DELIVERED", "TONU", "INVOICED"].includes(to)) await recomputeBillingStage(loadId, userId);
  await audit(userId, "status", "load", loadId, `${load.reference}: ${from} → ${to}`);
  after(() => notifyLoadStatus(loadId, to));
}

/** Keep the denormalised route summary in sync with the stops list. */
export function routeSummaryFromStops(stops: { type: string; seq: number; name: string; city: string; lat: number; lng: number; windowStart: Date | null; windowEnd: Date | null }[]) {
  const sorted = [...stops].sort((a, b) => a.seq - b.seq);
  const first = sorted.find((s) => s.type === "PICKUP") ?? sorted[0];
  const last = [...sorted].reverse().find((s) => s.type === "DELIVERY") ?? sorted[sorted.length - 1];
  if (!first || !last) throw new FormError("A load needs at least one pickup and one delivery");
  return {
    originName: first.name, originCity: first.city, originLat: first.lat, originLng: first.lng,
    destName: last.name, destCity: last.city, destLat: last.lat, destLng: last.lng,
    pickupAt: first.windowStart ?? first.windowEnd ?? new Date(),
    deliveryAt: last.windowEnd ?? last.windowStart ?? new Date(),
  };
}
