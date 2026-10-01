import "server-only";
import { db } from "@/lib/db";
import { EQUIPMENT_LABELS } from "@/lib/constants";

/** Dropdown options for load forms; units busy on other active loads are flagged. */
export async function assignmentOptions(excludeLoadId?: string) {
  const active = await db.load.findMany({
    where: { status: { in: ["ASSIGNED", "IN_TRANSIT"] }, ...(excludeLoadId ? { id: { not: excludeLoadId } } : {}) },
    select: { truckId: true, driverId: true, trailerId: true },
  });
  const busy = new Set(active.flatMap((l) => [l.truckId, l.driverId, l.trailerId]).filter(Boolean) as string[]);
  const [customers, trucks, drivers, trailers] = await Promise.all([
    db.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.truck.findMany({ where: { status: "ACTIVE" }, orderBy: { unitNumber: "asc" }, include: { driver: { select: { name: true } } } }),
    db.driver.findMany({ where: { status: { notIn: ["ON_LEAVE", "OFF_DUTY"] } }, orderBy: { name: "asc" } }),
    db.trailer.findMany({ where: { status: "ACTIVE" }, orderBy: { unitNumber: "asc" } }),
  ]);
  return {
    customers: customers.map((c) => ({ id: c.id, label: c.name })),
    trucks: trucks.map((t) => ({ id: t.id, label: `${t.unitNumber} · ${t.make} ${t.model}${t.driver ? ` (${t.driver.name})` : ""}`, disabled: busy.has(t.id) })),
    drivers: drivers.map((d) => ({ id: d.id, label: d.name, disabled: busy.has(d.id) })),
    trailers: trailers.map((t) => ({ id: t.id, label: `${t.unitNumber} · ${EQUIPMENT_LABELS[t.type] ?? t.type} ${(t.capacityKg / 1000).toFixed(0)}t`, disabled: busy.has(t.id) })),
  };
}
