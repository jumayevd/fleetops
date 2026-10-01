"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { attempt, fields, FormError, type ActionState } from "@/lib/action";
import { transitionLoad } from "@/lib/workflow";

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
    return { ok: to === "IN_TRANSIT" ? "Trip started — drive safe!" : "Delivery confirmed. Great job!" };
  });
}

export async function setDriverStatus(status: string) {
  const me = await requireUser("driver.portal");
  if (!me.driver || !["AVAILABLE", "OFF_DUTY", "ON_DUTY"].includes(status)) return;
  const driving = await db.load.count({ where: { driverId: me.driver.id, status: "IN_TRANSIT" } });
  if (driving) return; // stays DRIVING while on a trip
  await db.driver.update({ where: { id: me.driver.id }, data: { status } });
  revalidatePath("/driver");
}
