import "server-only";
import { db } from "@/lib/db";
import { CUSTOMER_KIND_LABELS, DRIVER_TYPE_LABELS, EQUIPMENT_LABELS, LOAD_STATUS_LABELS, ROLE_LABELS, humanize, type LoadStatus, type Role } from "@/lib/constants";
import { date } from "@/lib/format";
import type { ClaimFormOptions, LoadOption } from "./shared";
export type { ClaimFormOptions } from "./shared";

type Current = Partial<{ loadId: string | null; driverId: string | null; truckId: string | null; trailerId: string | null; customerId: string | null; assignedToId: string | null }>;

/**
 * Searchable-select options for the claim form. Recent loads (a year back), every driver who is
 * not inactive, every unit and every customer. Whatever the claim already points at is always
 * included so an edit never loses a reference to a retired unit or driver.
 */
export async function claimFormOptions(current: Current = {}): Promise<ClaimFormOptions> {
  const yearAgo = new Date(Date.now() - 365 * 86_400_000);
  const [loads, drivers, trucks, trailers, customers, users] = await Promise.all([
    db.load.findMany({
      where: { OR: [{ pickupAt: { gte: yearAgo }, status: { not: "CANCELLED" } }, ...(current.loadId ? [{ id: current.loadId }] : [])] },
      orderBy: { pickupAt: "desc" },
      take: 500,
      select: {
        id: true, reference: true, status: true, originCity: true, destCity: true, destName: true, customerRef: true, pickupAt: true, deliveredAt: true,
        driverId: true, truckId: true, trailerId: true, customerId: true, brokerId: true,
        customer: { select: { name: true } }, broker: { select: { name: true } }, driver: { select: { name: true } }, truck: { select: { unitNumber: true } },
      },
    }),
    db.driver.findMany({
      where: { OR: [{ status: { not: "INACTIVE" } }, ...(current.driverId ? [{ id: current.driverId }] : [])] },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true, status: true, phone: true, licenseNumber: true, truck: { select: { unitNumber: true } } },
    }),
    db.truck.findMany({ orderBy: { unitNumber: "asc" }, select: { id: true, unitNumber: true, make: true, model: true, plate: true, status: true, driver: { select: { name: true } } } }),
    db.trailer.findMany({ orderBy: { unitNumber: "asc" }, select: { id: true, unitNumber: true, type: true, plate: true, status: true } }),
    db.customer.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, kind: true, city: true } }),
    db.user.findMany({
      where: { OR: [{ active: true, role: { not: "DRIVER" } }, ...(current.assignedToId ? [{ id: current.assignedToId }] : [])] },
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true },
    }),
  ]);

  return {
    loads: loads.map((l): LoadOption => ({
      id: l.id,
      label: l.reference,
      hint: `${l.originCity} → ${l.destCity} · ${l.broker?.name ?? l.customer.name} · ${LOAD_STATUS_LABELS[l.status as LoadStatus] ?? humanize(l.status)} · ${date(l.pickupAt)}`,
      keywords: [l.customer.name, l.broker?.name, l.driver?.name, l.truck?.unitNumber, l.customerRef].filter(Boolean).join(" "),
      driverId: l.driverId, truckId: l.truckId, trailerId: l.trailerId, customerId: l.brokerId ?? l.customerId,
      place: `${l.destName}, ${l.destCity}`,
      deliveredAt: l.deliveredAt ? l.deliveredAt.toISOString() : null,
    })),
    drivers: drivers.map((d) => ({
      id: d.id, label: d.name,
      hint: [DRIVER_TYPE_LABELS[d.type] ?? d.type, d.truck?.unitNumber, d.status !== "ACTIVE" ? humanize(d.status).toLowerCase() : null].filter(Boolean).join(" · "),
      keywords: [d.phone, d.licenseNumber].filter(Boolean).join(" "),
    })),
    trucks: trucks.map((t) => ({
      id: t.id, label: t.unitNumber,
      hint: [`${t.make} ${t.model}`, t.plate, t.driver?.name, t.status !== "ACTIVE" ? humanize(t.status).toLowerCase() : null].filter(Boolean).join(" · "),
      keywords: [t.plate, t.driver?.name].filter(Boolean).join(" "),
    })),
    trailers: trailers.map((t) => ({
      id: t.id, label: t.unitNumber,
      hint: [EQUIPMENT_LABELS[t.type] ?? t.type, t.plate, humanize(t.status).toLowerCase()].filter(Boolean).join(" · "),
      keywords: t.plate ?? undefined,
    })),
    customers: customers.map((c) => ({
      id: c.id, label: c.name,
      hint: [CUSTOMER_KIND_LABELS[c.kind] ?? c.kind, c.city].filter(Boolean).join(" · "),
    })),
    assignees: users.map((u) => ({ id: u.id, label: u.name, hint: ROLE_LABELS[u.role as Role] ?? u.role })),
  };
}
