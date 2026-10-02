"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { attempt, fields, FormError, type ActionState } from "@/lib/action";
import { arriveAtStop, clearDriverBoardOverride, completeStop, setDriverBoardStatus, transitionLoad } from "@/lib/workflow";

/** Drivers can only move their own loads forward: ASSIGNED → IN_TRANSIT → DELIVERED. */
export async function driverUpdateLoad(loadId: string, _: ActionState, fd: FormData): Promise<ActionState> {
  const me = await requireUser("driver.portal");
  return attempt(async () => {
    const load = await db.load.findUniqueOrThrow({ where: { id: loadId } });
    if (!me.driver || load.driverId !== me.driver.id) throw new FormError("This load isn't assigned to you");
    const f = fields(fd);
    const to = f.req("status");
    if (!["IN_TRANSIT", "DELIVERED"].includes(to)) throw new FormError("Drivers can only start or complete loads");
    if (to === "DELIVERED" && !f.str("podSignedBy")) throw new FormError("Enter who signed the proof of delivery");
    await transitionLoad(loadId, to as "IN_TRANSIT" | "DELIVERED", me.id, {
      podSignedBy: f.str("podSignedBy"), lat: f.num("lat") ?? undefined, lng: f.num("lng") ?? undefined,
    });
    revalidatePath("/driver");
    return { ok: to === "IN_TRANSIT" ? "Trip started — drive safe" : "Delivery confirmed. Great job" };
  });
}

/** Arrived / loaded / unloaded at a stop. Completing the last delivery stop does not deliver the load — the POD form does. */
export async function driverStopAction(loadId: string, stopId: string, action: "arrive" | "complete", pos?: { lat?: number; lng?: number }) {
  const me = await requireUser("driver.portal");
  const load = await db.load.findUniqueOrThrow({ where: { id: loadId } });
  if (!me.driver || load.driverId !== me.driver.id) throw new Error("This load isn't assigned to you");
  if (action === "arrive") await arriveAtStop(loadId, stopId, me.id, pos);
  else await completeStop(loadId, stopId, me.id, pos);
  revalidatePath("/driver");
}

/** Driver sets their own availability when not on a trip: READY (back to automatic), REST, HOME. */
export async function setDriverStatus(status: string) {
  const me = await requireUser("driver.portal");
  if (!me.driver || !["READY", "REST", "HOME"].includes(status)) return;
  const onTrip = await db.load.count({ where: { driverId: me.driver.id, status: "IN_TRANSIT" } });
  if (onTrip) return; // the board follows the trip while driving
  if (status === "READY") await clearDriverBoardOverride(me.driver.id, me.id);
  else await setDriverBoardStatus(me.driver.id, status as "REST" | "HOME", me.id, "set by driver");
  revalidatePath("/driver");
  revalidatePath("/dispatch");
}
