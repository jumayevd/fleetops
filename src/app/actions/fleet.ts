"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { attempt, fields, FormError, type ActionState } from "@/lib/action";
import { TRAILER_STATUSES, WORK_ORDER_CATEGORIES, WORK_ORDER_PRIORITIES, WORK_ORDER_STATUSES } from "@/lib/constants";
import { notifyMaintenance } from "@/lib/notify";

/* ------------------------------------------------------------------ */
/* Trucks                                                              */
/* ------------------------------------------------------------------ */

export async function saveTruck(truckId: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireUser("fleet.edit");
  let id = truckId;
  const res = await attempt(async () => {
    const f = fields(fd);
    const driverId = f.str("driverId");
    if (driverId) {
      const other = await db.truck.findFirst({ where: { driverId, id: truckId ? { not: truckId } : undefined } });
      if (other) throw new FormError(`That driver is already assigned to ${other.unitNumber}`);
    }
    const ownership = f.str("ownership") ?? "COMPANY";
    const data = {
      unitNumber: f.req("unitNumber", "Unit number"),
      make: f.req("make", "Make"),
      model: f.req("model", "Model"),
      year: f.num("year") ?? new Date().getFullYear(),
      vin: f.str("vin"),
      plate: f.req("plate", "Plate"),
      status: f.str("status") ?? "ACTIVE",
      ownership,
      group: f.str("group"),
      lessor: ownership === "LEASED" ? f.str("lessor") : null,
      leaseStartKm: ownership === "LEASED" ? f.num("leaseStartKm") : null,
      leaseAnnualLimitKm: ownership === "LEASED" ? f.num("leaseAnnualLimitKm") : null,
      leaseBufferPct: ownership === "LEASED" ? f.num("leaseBufferPct") : null,
      leaseOverageRate: ownership === "LEASED" ? f.num("leaseOverageRate") : null,
      odometerKm: f.num("odometerKm") ?? 0,
      pmIntervalKm: f.num("pmIntervalKm") ?? 30000,
      lastPmKm: f.num("lastPmKm"),
      lastPmAt: f.date("lastPmAt"),
      nextServiceKm: f.num("nextServiceKm"),
      fuelType: f.str("fuelType") ?? "DIESEL",
      fuelCapacityL: f.num("fuelCapacityL") ?? 600,
      insuranceExpiry: f.date("insuranceExpiry"),
      inspectionExpiry: f.date("inspectionExpiry"),
      registrationExpiry: f.date("registrationExpiry"),
      notes: f.str("notes"),
      driverId,
    };
    if (truckId) {
      await db.truck.update({ where: { id: truckId }, data });
      await audit(me.id, "update", "truck", truckId, data.unitNumber);
    } else {
      const t = await db.truck.create({ data: { ...data, lat: 41.2995, lng: 69.2401, locationName: "Tashkent" } });
      id = t.id;
      await audit(me.id, "create", "truck", t.id, data.unitNumber);
    }
  });
  if (res?.error) return res;
  revalidatePath("/fleet");
  redirect(`/fleet/${id}`);
}

export async function setTruckStatus(truckId: string, status: string) {
  const me = await requireUser("fleet.edit");
  if (!["ACTIVE", "MAINTENANCE", "OUT_OF_SERVICE", "INACTIVE"].includes(status)) throw new Error("Invalid status");
  const busy = await db.load.findFirst({ where: { truckId, status: { in: ["ASSIGNED", "IN_TRANSIT"] } } });
  if (busy && status !== "ACTIVE") throw new Error(`Truck is on ${busy.reference} — recover the load first`);
  const t = await db.truck.update({ where: { id: truckId }, data: { status } });
  await audit(me.id, "status", "truck", truckId, `${t.unitNumber} → ${status}`);
  revalidatePath("/fleet");
  revalidatePath(`/fleet/${truckId}`);
}

export async function addTruckNote(truckId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireUser("fleet.edit");
  return attempt(async () => {
    const note = fields(fd).req("note", "Note");
    const t = await db.truck.findUniqueOrThrow({ where: { id: truckId } });
    const stamp = `${new Date().toISOString().slice(0, 10)} ${me.name}: ${note}`;
    await db.truck.update({ where: { id: truckId }, data: { notes: t.notes ? `${stamp}\n${t.notes}` : stamp } });
    await audit(me.id, "note", "truck", truckId, note);
    revalidatePath(`/fleet/${truckId}`);
    return { ok: "Note added" };
  });
}

/* ------------------------------------------------------------------ */
/* Trailers                                                            */
/* ------------------------------------------------------------------ */

export async function saveTrailer(trailerId: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireUser("fleet.edit");
  return attempt(async () => {
    const f = fields(fd);
    const status = f.str("status") ?? "EMPTY";
    if (!TRAILER_STATUSES.includes(status as never)) throw new FormError("Invalid status");
    const existing = trailerId ? await db.trailer.findUniqueOrThrow({ where: { id: trailerId } }) : null;
    const data = {
      unitNumber: f.req("unitNumber", "Unit number"),
      type: f.req("type", "Type"),
      capacityKg: f.num("capacityKg") ?? 20000,
      plate: f.str("plate"),
      year: f.num("year"),
      status,
      statusSince: existing && existing.status === status ? existing.statusSince : new Date(),
      truckId: f.str("truckId"),
      gpsProvider: f.str("gpsProvider"),
      insuranceExpiry: f.date("insuranceExpiry"),
      inspectionExpiry: f.date("inspectionExpiry"),
      locationName: f.str("locationName"),
      notes: f.str("notes"),
    };
    if (trailerId) await db.trailer.update({ where: { id: trailerId }, data });
    else await db.trailer.create({ data });
    await audit(me.id, trailerId ? "update" : "create", "trailer", trailerId, data.unitNumber);
    revalidatePath("/fleet/trailers");
    return { ok: `Trailer ${data.unitNumber} saved` };
  });
}

/** Inline status change from the trailer list. */
export async function setTrailerStatus(trailerId: string, status: string, locationName?: string | null) {
  const me = await requireUser("fleet.edit");
  if (!TRAILER_STATUSES.includes(status as never)) throw new Error("Invalid status");
  const busy = await db.load.findFirst({ where: { trailerId, status: { in: ["ASSIGNED", "IN_TRANSIT"] } } });
  if (busy && status !== "IN_USE") throw new Error(`Trailer is on ${busy.reference}`);
  const t = await db.trailer.update({
    where: { id: trailerId },
    data: { status, statusSince: new Date(), ...(locationName ? { locationName } : {}), ...(status !== "IN_USE" ? { truckId: null } : {}) },
  });
  await audit(me.id, "status", "trailer", trailerId, `${t.unitNumber} → ${status}`);
  revalidatePath("/fleet/trailers");
}

/* ------------------------------------------------------------------ */
/* Work orders                                                         */
/* ------------------------------------------------------------------ */

async function applyWorkOrderSideEffects(id: string, status: string, userId: string) {
  const wo = await db.workOrder.findUniqueOrThrow({ where: { id }, include: { truck: true, trailer: true } });
  const now = new Date();
  if (status === "IN_PROGRESS") {
    await db.workOrder.update({ where: { id }, data: { inAt: wo.inAt ?? now } });
    if (wo.truckId) await db.truck.update({ where: { id: wo.truckId }, data: { status: "MAINTENANCE" } });
    if (wo.trailerId) await db.trailer.update({ where: { id: wo.trailerId }, data: { status: "SHOP", statusSince: now, truckId: null } });
    after(() => notifyMaintenance(id, status));
  }
  if (status === "DONE") {
    await db.workOrder.update({ where: { id }, data: { outAt: wo.outAt ?? now, completedAt: now } });
    if (wo.truckId) {
      const open = await db.workOrder.count({ where: { truckId: wo.truckId, status: "IN_PROGRESS", id: { not: id } } });
      const data: Record<string, unknown> = {};
      if (!open && wo.truck?.status === "MAINTENANCE") data.status = "ACTIVE";
      if (wo.category === "PM") {
        const odo = wo.odometerKm ?? wo.truck?.odometerKm ?? 0;
        data.lastPmKm = odo; data.lastPmAt = now; data.nextServiceKm = odo + (wo.truck?.pmIntervalKm ?? 30000);
      }
      if (wo.category === "INSPECTION") data.inspectionExpiry = new Date(now.getTime() + 365 * 86_400_000);
      if (Object.keys(data).length) await db.truck.update({ where: { id: wo.truckId }, data });
    }
    if (wo.trailerId) {
      const open = await db.workOrder.count({ where: { trailerId: wo.trailerId, status: "IN_PROGRESS", id: { not: id } } });
      if (!open && wo.trailer?.status === "SHOP") await db.trailer.update({ where: { id: wo.trailerId }, data: { status: "YARD", statusSince: now } });
    }
    after(() => notifyMaintenance(id, status));
  }
  await audit(userId, "status", "work_order", id, `#${wo.number} ${wo.title} → ${status}`);
}

export async function saveWorkOrder(workOrderId: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireUser("fleet.edit");
  let id = workOrderId;
  const res = await attempt(async () => {
    const f = fields(fd);
    const truckId = f.str("truckId");
    const trailerId = f.str("trailerId");
    if (!truckId && !trailerId) throw new FormError("Pick a truck or a trailer");
    const category = f.str("category") ?? "OTHER";
    const priority = f.str("priority") ?? "MEDIUM";
    const status = f.str("status") ?? "OPEN";
    if (!WORK_ORDER_CATEGORIES.includes(category as never)) throw new FormError("Invalid category");
    if (!WORK_ORDER_PRIORITIES.includes(priority as never)) throw new FormError("Invalid priority");
    if (!WORK_ORDER_STATUSES.includes(status as never)) throw new FormError("Invalid status");
    const laborCost = f.num("laborCost") ?? 0;
    const partsCost = f.num("partsCost") ?? 0;
    const data = {
      truckId: truckId ?? null, trailerId: truckId ? null : trailerId,
      title: f.req("title", "Title"),
      description: f.str("description"),
      category, priority, status,
      vendor: f.str("vendor"),
      scheduledAt: f.date("scheduledAt") ?? new Date(),
      inAt: f.date("inAt"), outAt: f.date("outAt"),
      odometerKm: f.num("odometerKm"),
      laborCost, partsCost, cost: f.num("cost") ?? laborCost + partsCost,
      notes: f.str("notes"),
    };
    const prevStatus = workOrderId ? (await db.workOrder.findUniqueOrThrow({ where: { id: workOrderId } })).status : null;
    if (workOrderId) {
      await db.workOrder.update({ where: { id: workOrderId }, data });
      await audit(me.id, "update", "work_order", workOrderId, data.title);
    } else {
      const wo = await db.workOrder.create({ data: { ...data, createdById: me.id } });
      id = wo.id;
      await audit(me.id, "create", "work_order", wo.id, `#${wo.number} ${data.title}`);
    }
    if (prevStatus !== status && ["IN_PROGRESS", "DONE"].includes(status)) await applyWorkOrderSideEffects(id!, status, me.id);
  });
  if (res?.error) return res;
  revalidatePath("/maintenance");
  revalidatePath("/maintenance/work-orders");
  redirect(`/maintenance/work-orders/${id}`);
}

export async function setWorkOrderStatus(id: string, status: string) {
  const me = await requireUser("fleet.edit");
  if (!WORK_ORDER_STATUSES.includes(status as never)) throw new Error("Invalid status");
  await db.workOrder.update({ where: { id }, data: { status } });
  await applyWorkOrderSideEffects(id, status, me.id);
  const wo = await db.workOrder.findUniqueOrThrow({ where: { id } });
  revalidatePath("/maintenance");
  revalidatePath("/maintenance/work-orders");
  revalidatePath(`/maintenance/work-orders/${id}`);
  if (wo.truckId) revalidatePath(`/fleet/${wo.truckId}`);
}

/** Quick "create and start" from a truck page (the old maintenance form). */
export async function saveMaintenance(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireUser("fleet.edit");
  return attempt(async () => {
    const f = fields(fd);
    const truckId = f.req("truckId", "Truck");
    const status = f.str("status") ?? "OPEN";
    const category = f.str("type") ?? f.str("category") ?? "OTHER";
    const wo = await db.workOrder.create({
      data: {
        truckId, title: f.req("description", "Description"), category: WORK_ORDER_CATEGORIES.includes(category as never) ? category : "OTHER",
        status: status === "SCHEDULED" ? "OPEN" : status, scheduledAt: f.date("scheduledAt") ?? new Date(),
        cost: f.num("cost") ?? 0, vendor: f.str("vendor"), odometerKm: f.num("odometerKm"), createdById: me.id,
      },
    });
    if (["IN_PROGRESS", "DONE"].includes(wo.status)) await applyWorkOrderSideEffects(wo.id, wo.status, me.id);
    revalidatePath("/maintenance");
    revalidatePath(`/fleet/${truckId}`);
    return { ok: `Work order #${wo.number} created` };
  });
}

/** @deprecated use setWorkOrderStatus */
export const setMaintenanceStatus = setWorkOrderStatus;

/* ------------------------------------------------------------------ */
/* Fuel                                                                */
/* ------------------------------------------------------------------ */

export async function addFuelLog(truckId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireUser();
  return attempt(async () => {
    const f = fields(fd);
    const truck = await db.truck.findUniqueOrThrow({ where: { id: truckId } });
    if (me.role === "DRIVER" && truck.driverId !== me.driver?.id) throw new FormError("Not your truck");
    if (me.role !== "DRIVER" && !["OWNER", "ADMIN", "FLEET_MANAGER"].includes(me.role)) throw new FormError("Not allowed");
    const liters = f.num("liters");
    const cost = f.num("cost");
    if (!liters || !cost) throw new FormError("Liters and cost are required");
    const odometerKm = f.num("odometerKm");
    await db.fuelLog.create({ data: { truckId, driverId: truck.driverId, liters, cost, odometerKm, station: f.str("station") } });
    if (odometerKm && odometerKm > truck.odometerKm) await db.truck.update({ where: { id: truckId }, data: { odometerKm, fuelPct: 95 } });
    revalidatePath(`/fleet/${truckId}`);
    revalidatePath("/driver");
    return { ok: "Fuel logged" };
  });
}
