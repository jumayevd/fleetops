import "server-only";
import { after } from "next/server";
import { notifyLoadStatus } from "./notify";
import { db } from "./db";
import { audit } from "./audit";
import { FormError } from "./action";
import { LOAD_STATUS_LABELS, LOAD_TRANSITIONS, type LoadStatus } from "./constants";

const DAY = 86_400_000;

export async function nextInvoiceNumber() {
  const last = await db.invoice.findFirst({ orderBy: { number: "desc" }, select: { number: true } });
  const n = last ? Number(last.number.replace(/\D/g, "")) + 1 : 5001;
  return `INV-${n}`;
}

export async function nextLoadReference() {
  const last = await db.load.findFirst({ orderBy: { reference: "desc" }, select: { reference: true } });
  const n = last ? Number(last.reference.replace(/\D/g, "")) + 1 : 10001;
  return `LD-${n}`;
}

export async function createInvoiceForLoad(loadId: string, userId: string | null) {
  const load = await db.load.findUniqueOrThrow({ where: { id: loadId }, include: { customer: true, invoice: true } });
  if (load.invoice) return load.invoice;
  const invoice = await db.invoice.create({
    data: {
      number: await nextInvoiceNumber(),
      customerId: load.customerId,
      loadId: load.id,
      amount: load.rate,
      status: "DRAFT",
      dueAt: new Date(Date.now() + load.customer.paymentTerms * DAY),
    },
  });
  await audit(userId, "create", "invoice", invoice.id, `${invoice.number} for ${load.reference}`);
  return invoice;
}

/** Validate a truck/driver/trailer isn't already committed to another active load. */
export async function assertAvailable(loadId: string | null, ids: { truckId?: string | null; driverId?: string | null; trailerId?: string | null }) {
  const active = { in: ["ASSIGNED", "IN_TRANSIT"] };
  const notThis = loadId ? { id: { not: loadId } } : {};
  if (ids.truckId) {
    const truck = await db.truck.findUnique({ where: { id: ids.truckId } });
    if (!truck) throw new FormError("Truck not found");
    if (truck.status !== "ACTIVE") throw new FormError(`${truck.unitNumber} is not active (${truck.status.toLowerCase()})`);
    const busy = await db.load.findFirst({ where: { truckId: ids.truckId, status: active, ...notThis } });
    if (busy) throw new FormError(`${truck.unitNumber} is already on ${busy.reference}`);
  }
  if (ids.driverId) {
    const driver = await db.driver.findUnique({ where: { id: ids.driverId } });
    if (!driver) throw new FormError("Driver not found");
    if (["ON_LEAVE", "OFF_DUTY"].includes(driver.status)) throw new FormError(`${driver.name} is ${driver.status.toLowerCase().replace("_", " ")}`);
    if (driver.licenseExpiry < new Date()) throw new FormError(`${driver.name}'s license has expired`);
    const busy = await db.load.findFirst({ where: { driverId: ids.driverId, status: active, ...notThis } });
    if (busy) throw new FormError(`${driver.name} is already on ${busy.reference}`);
  }
  if (ids.trailerId) {
    const trailer = await db.trailer.findUnique({ where: { id: ids.trailerId } });
    if (!trailer) throw new FormError("Trailer not found");
    if (trailer.status !== "ACTIVE") throw new FormError(`${trailer.unitNumber} is not active`);
    const busy = await db.load.findFirst({ where: { trailerId: ids.trailerId, status: active, ...notThis } });
    if (busy) throw new FormError(`${trailer.unitNumber} is already on ${busy.reference}`);
  }
}

export async function transitionLoad(loadId: string, to: LoadStatus, userId: string | null, opts: { podSignedBy?: string | null; lat?: number; lng?: number } = {}) {
  const load = await db.load.findUniqueOrThrow({ where: { id: loadId } });
  const from = load.status as LoadStatus;
  if (!LOAD_TRANSITIONS[from].includes(to)) {
    throw new FormError(`Cannot move a load from ${LOAD_STATUS_LABELS[from]} to ${LOAD_STATUS_LABELS[to]}`);
  }
  const now = new Date();
  let message = `Status: ${LOAD_STATUS_LABELS[from]} → ${LOAD_STATUS_LABELS[to]}`;

  switch (to) {
    case "ASSIGNED":
      if (!load.truckId || !load.driverId) throw new FormError("Assign a truck and driver first");
      break;
    case "IN_TRANSIT":
      if (!load.truckId || !load.driverId) throw new FormError("Assign a truck and driver first");
      await db.load.update({ where: { id: loadId }, data: { departedAt: now } });
      await db.driver.update({ where: { id: load.driverId }, data: { status: "DRIVING" } });
      await db.truck.update({ where: { id: load.truckId }, data: { lat: load.originLat, lng: load.originLng, lastPingAt: now } });
      message = `Picked up at ${load.originName} — in transit`;
      break;
    case "DELIVERED":
      await db.load.update({ where: { id: loadId }, data: { deliveredAt: now, podSignedBy: opts.podSignedBy ?? null } });
      if (load.driverId) await db.driver.update({ where: { id: load.driverId }, data: { status: "AVAILABLE" } });
      if (load.truckId) {
        await db.truck.update({
          where: { id: load.truckId },
          data: { lat: load.destLat, lng: load.destLng, speedKmh: 0, lastPingAt: now, odometerKm: { increment: Math.round(load.distanceKm) } },
        });
      }
      message = `Delivered to ${load.destName}${opts.podSignedBy ? ` — POD signed by ${opts.podSignedBy}` : ""}`;
      break;
    case "INVOICED":
      await createInvoiceForLoad(loadId, userId);
      message = "Invoice generated";
      break;
    case "CANCELLED":
    case "PLANNED":
      if (load.driverId && from === "ASSIGNED") await db.driver.update({ where: { id: load.driverId }, data: { status: "AVAILABLE" } });
      if (to === "PLANNED" && from === "ASSIGNED") {
        await db.load.update({ where: { id: loadId }, data: { truckId: null, driverId: null, trailerId: null } });
        message = "Unassigned — back to planning";
      }
      break;
  }

  await db.load.update({ where: { id: loadId }, data: { status: to } });
  await db.loadEvent.create({ data: { loadId, type: "STATUS", message, userId, lat: opts.lat, lng: opts.lng } });
  await audit(userId, "status", "load", loadId, `${load.reference}: ${from} → ${to}`);
  after(() => notifyLoadStatus(loadId, to));
}
