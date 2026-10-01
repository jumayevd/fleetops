"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { notifyMaintenance } from "@/lib/notify";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { attempt, fields, FormError, type ActionState } from "@/lib/action";

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
    const data = {
      unitNumber: f.req("unitNumber", "Unit number"),
      make: f.req("make", "Make"),
      model: f.req("model", "Model"),
      year: f.num("year") ?? new Date().getFullYear(),
      vin: f.str("vin"),
      plate: f.req("plate", "Plate"),
      status: f.str("status") ?? "ACTIVE",
      odometerKm: f.num("odometerKm") ?? 0,
      nextServiceKm: f.num("nextServiceKm"),
      fuelType: f.str("fuelType") ?? "DIESEL",
      fuelCapacityL: f.num("fuelCapacityL") ?? 600,
      insuranceExpiry: f.date("insuranceExpiry"),
      inspectionExpiry: f.date("inspectionExpiry"),
      driverId,
    };
    if (truckId) {
      await db.truck.update({ where: { id: truckId }, data });
      await audit(me.id, "update", "truck", truckId, data.unitNumber);
    } else {
      const t = await db.truck.create({ data: { ...data, lat: 41.2995, lng: 69.2401 } });
      id = t.id;
      await audit(me.id, "create", "truck", t.id, data.unitNumber);
    }
  });
  if (res?.error) return res;
  revalidatePath("/fleet");
  redirect(`/fleet/${id}`);
}

export async function saveTrailer(trailerId: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireUser("fleet.edit");
  return attempt(async () => {
    const f = fields(fd);
    const data = {
      unitNumber: f.req("unitNumber", "Unit number"),
      type: f.req("type", "Type"),
      capacityKg: f.num("capacityKg") ?? 20000,
      plate: f.str("plate"),
      status: f.str("status") ?? "ACTIVE",
    };
    if (trailerId) await db.trailer.update({ where: { id: trailerId }, data });
    else await db.trailer.create({ data });
    await audit(me.id, trailerId ? "update" : "create", "trailer", trailerId, data.unitNumber);
    revalidatePath("/fleet");
    return { ok: `Trailer ${data.unitNumber} saved` };
  });
}

export async function saveMaintenance(_: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireUser("fleet.edit");
  return attempt(async () => {
    const f = fields(fd);
    const truckId = f.req("truckId", "Truck");
    const status = f.str("status") ?? "SCHEDULED";
    const rec = await db.maintenanceRecord.create({
      data: {
        truckId,
        type: f.req("type", "Type"),
        description: f.req("description", "Description"),
        status,
        scheduledAt: f.date("scheduledAt") ?? new Date(),
        completedAt: status === "DONE" ? new Date() : null,
        cost: f.num("cost") ?? 0,
        vendor: f.str("vendor"),
        odometerKm: f.num("odometerKm"),
      },
    });
    if (status === "IN_PROGRESS") {
      await db.truck.update({ where: { id: truckId }, data: { status: "MAINTENANCE" } });
      after(() => notifyMaintenance(rec.id, status));
    }
    await audit(me.id, "create", "maintenance", rec.id, rec.description);
    revalidatePath("/maintenance");
    revalidatePath(`/fleet/${truckId}`);
    return { ok: "Work order created" };
  });
}

export async function setMaintenanceStatus(id: string, status: string) {
  const me = await requireUser("fleet.edit");
  const rec = await db.maintenanceRecord.update({
    where: { id },
    data: { status, completedAt: status === "DONE" ? new Date() : null },
  });
  if (status === "IN_PROGRESS") await db.truck.update({ where: { id: rec.truckId }, data: { status: "MAINTENANCE" } });
  if (status === "DONE") {
    const open = await db.maintenanceRecord.count({ where: { truckId: rec.truckId, status: "IN_PROGRESS" } });
    const truck = await db.truck.findUniqueOrThrow({ where: { id: rec.truckId } });
    if (!open && truck.status === "MAINTENANCE") {
      await db.truck.update({
        where: { id: rec.truckId },
        data: { status: "ACTIVE", nextServiceKm: ["PREVENTIVE", "OIL_CHANGE"].includes(rec.type) ? truck.odometerKm + 30000 : undefined },
      });
    }
  }
  if (status === "IN_PROGRESS" || status === "DONE") after(() => notifyMaintenance(id, status));
  await audit(me.id, "status", "maintenance", id, `${rec.description} → ${status}`);
  revalidatePath("/maintenance");
  revalidatePath(`/fleet/${rec.truckId}`);
}

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
    await db.fuelLog.create({
      data: { truckId, driverId: truck.driverId, liters, cost, odometerKm, station: f.str("station") },
    });
    if (odometerKm && odometerKm > truck.odometerKm) await db.truck.update({ where: { id: truckId }, data: { odometerKm } });
    revalidatePath(`/fleet/${truckId}`);
    revalidatePath("/driver");
    return { ok: "Fuel logged" };
  });
}
