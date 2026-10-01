"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { notifyLoadAssigned, notifyLoadIssue } from "@/lib/notify";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { attempt, fields, FormError, type ActionState } from "@/lib/action";
import { CITIES, LOAD_STATUSES, type LoadStatus } from "@/lib/constants";
import { roadKm } from "@/lib/geo";
import { assertAvailable, nextLoadReference, transitionLoad } from "@/lib/workflow";

function resolvePlace(f: ReturnType<typeof fields>, prefix: "origin" | "dest") {
  const cityName = f.req(`${prefix}City`, prefix === "origin" ? "Pickup city" : "Delivery city");
  const known = CITIES.find((c) => c.name.toLowerCase() === cityName.toLowerCase());
  const lat = f.num(`${prefix}Lat`) ?? known?.lat;
  const lng = f.num(`${prefix}Lng`) ?? known?.lng;
  if (lat == null || lng == null) throw new FormError(`Unknown city "${cityName}" — pick from the list or enter coordinates`);
  return {
    city: known?.name ?? cityName,
    name: f.str(`${prefix}Name`) ?? `${known?.name ?? cityName}`,
    lat, lng,
  };
}

export async function saveLoad(loadId: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireUser("loads.edit");
  let id = loadId;
  const res = await attempt(async () => {
    const f = fields(fd);
    const origin = resolvePlace(f, "origin");
    const dest = resolvePlace(f, "dest");
    const pickupAt = f.date("pickupAt");
    const deliveryAt = f.date("deliveryAt");
    if (!pickupAt || !deliveryAt) throw new FormError("Pickup and delivery times are required");
    if (deliveryAt <= pickupAt) throw new FormError("Delivery must be after pickup");

    const truckId = f.str("truckId");
    const driverId = f.str("driverId");
    const trailerId = f.str("trailerId");
    await assertAvailable(loadId, { truckId, driverId, trailerId });

    const distanceKm = f.num("distanceKm") ?? roadKm(origin, dest);
    const driver = driverId ? await db.driver.findUnique({ where: { id: driverId } }) : null;

    const data = {
      customerId: f.req("customerId", "Customer"),
      priority: f.str("priority") ?? "NORMAL",
      originName: origin.name, originCity: origin.city, originLat: origin.lat, originLng: origin.lng,
      destName: dest.name, destCity: dest.city, destLat: dest.lat, destLng: dest.lng,
      pickupAt, deliveryAt, distanceKm,
      commodity: f.req("commodity", "Commodity"),
      weightKg: f.num("weightKg") ?? 0,
      pallets: f.num("pallets"),
      equipment: f.str("equipment") ?? "DRY_VAN",
      temperatureC: f.num("temperatureC"),
      hazmat: f.bool("hazmat"),
      rate: f.num("rate") ?? 0,
      driverPay: f.num("driverPay") ?? (driver ? Math.round(distanceKm * driver.payPerKm) : 0),
      fuelCost: f.num("fuelCost") ?? Math.round(distanceKm * 0.3),
      otherCost: f.num("otherCost") ?? 0,
      notes: f.str("notes"),
      truckId, driverId, trailerId,
    };

    if (loadId) {
      const existing = await db.load.findUniqueOrThrow({ where: { id: loadId } });
      if (["DELIVERED", "INVOICED"].includes(existing.status) && (truckId !== existing.truckId || driverId !== existing.driverId)) {
        throw new FormError("Cannot change assignment of a completed load");
      }
      const status = existing.status === "PLANNED" && truckId && driverId ? "ASSIGNED" : existing.status;
      await db.load.update({ where: { id: loadId }, data: { ...data, status } });
      await db.loadEvent.create({ data: { loadId, type: "NOTE", message: "Load details updated", userId: me.id } });
      await audit(me.id, "update", "load", loadId, existing.reference);
    } else {
      const reference = await nextLoadReference();
      const assigned = Boolean(truckId && driverId);
      const load = await db.load.create({
        data: { ...data, reference, status: assigned ? "ASSIGNED" : "PLANNED", dispatcherId: me.id },
      });
      id = load.id;
      await db.loadEvent.create({ data: { loadId: load.id, type: "CREATED", message: `Load created for ${data.commodity}`, userId: me.id } });
      if (assigned) {
        await db.loadEvent.create({ data: { loadId: load.id, type: "ASSIGNED", message: "Truck, trailer and driver assigned", userId: me.id } });
        await db.driver.update({ where: { id: driverId! }, data: { status: "ON_DUTY" } });
        after(() => notifyLoadAssigned(load.id));
      }
      await audit(me.id, "create", "load", load.id, reference);
    }
  });
  if (res?.error) return res;
  revalidatePath("/loads");
  redirect(`/loads/${id}`);
}

export async function assignLoad(loadId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireUser("loads.edit");
  return attempt(async () => {
    const f = fields(fd);
    const truckId = f.req("truckId", "Truck");
    const driverId = f.req("driverId", "Driver");
    const trailerId = f.str("trailerId");
    const load = await db.load.findUniqueOrThrow({ where: { id: loadId } });
    if (!["PLANNED", "ASSIGNED"].includes(load.status)) throw new FormError("Only planned or assigned loads can be (re)assigned");
    await assertAvailable(loadId, { truckId, driverId, trailerId });
    if (load.driverId && load.driverId !== driverId) await db.driver.update({ where: { id: load.driverId }, data: { status: "AVAILABLE" } });
    const [truck, driver] = await Promise.all([
      db.truck.findUniqueOrThrow({ where: { id: truckId } }),
      db.driver.findUniqueOrThrow({ where: { id: driverId } }),
    ]);
    await db.load.update({
      where: { id: loadId },
      data: { truckId, driverId, trailerId, status: "ASSIGNED", driverPay: Math.round(load.distanceKm * driver.payPerKm) },
    });
    await db.driver.update({ where: { id: driverId }, data: { status: "ON_DUTY" } });
    await db.loadEvent.create({ data: { loadId, type: "ASSIGNED", message: `Assigned ${truck.unitNumber} · ${driver.name}`, userId: me.id } });
    after(() => notifyLoadAssigned(loadId));
    await audit(me.id, "assign", "load", loadId, `${load.reference} → ${truck.unitNumber}/${driver.name}`);
    revalidatePath(`/loads/${loadId}`);
    return { ok: "Assignment saved" };
  });
}

export async function setLoadStatus(loadId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireUser("loads.edit");
  return attempt(async () => {
    const to = String(fd.get("status")) as LoadStatus;
    if (!LOAD_STATUSES.includes(to)) throw new FormError("Invalid status");
    await transitionLoad(loadId, to, me.id, { podSignedBy: fields(fd).str("podSignedBy") });
    revalidatePath(`/loads/${loadId}`);
    revalidatePath("/loads");
    return { ok: "Status updated" };
  });
}

export async function addLoadEvent(loadId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireUser();
  return attempt(async () => {
    const f = fields(fd);
    const message = f.req("message", "Message");
    const type = f.str("type") ?? "NOTE";
    if (!["NOTE", "CHECK_CALL", "ISSUE"].includes(type)) throw new FormError("Invalid type");
    if (me.role === "DRIVER") {
      const load = await db.load.findUnique({ where: { id: loadId } });
      if (load?.driverId !== me.driver?.id) throw new FormError("Not your load");
    }
    await db.loadEvent.create({ data: { loadId, type, message, userId: me.id } });
    if (type === "ISSUE") after(() => notifyLoadIssue(loadId, message, me.id));
    revalidatePath(`/loads/${loadId}`);
    revalidatePath("/driver");
    return { ok: "Added to timeline" };
  });
}

export async function deleteLoad(loadId: string) {
  const me = await requireUser("users.manage");
  const load = await db.load.findUniqueOrThrow({ where: { id: loadId } });
  if (!["PLANNED", "CANCELLED"].includes(load.status)) throw new Error("Only planned or cancelled loads can be deleted");
  await db.load.delete({ where: { id: loadId } });
  await audit(me.id, "delete", "load", loadId, load.reference);
  revalidatePath("/loads");
  redirect("/loads");
}
