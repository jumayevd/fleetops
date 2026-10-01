import "server-only";
import { db } from "./db";
import { bearing, pointOnRoute, routePolyline } from "./geo";

/**
 * Telemetry: until real GPS devices / ELDs are integrated, trucks on an
 * in-transit load are simulated moving along their route based on elapsed
 * time. A real device ping (driver app or /api/telemetry/ping) always wins
 * over simulation for DEVICE_FRESH_MS.
 */
const AVG_SPEED_KMH = 58; // incl. stops, border crossings, rest breaks
const DEVICE_FRESH_MS = 5 * 60_000;
const SYNC_THROTTLE_MS = 10_000;
let lastSync = 0;

export function loadProgress(load: { departedAt: Date | null; distanceKm: number }, now = Date.now()) {
  if (!load.departedAt) return 0;
  const durationMs = (load.distanceKm / AVG_SPEED_KMH) * 3_600_000;
  return Math.min(1, Math.max(0, (now - load.departedAt.getTime()) / durationMs));
}

export function estimatedArrival(load: { departedAt: Date | null; distanceKm: number }) {
  if (!load.departedAt) return null;
  return new Date(load.departedAt.getTime() + (load.distanceKm / AVG_SPEED_KMH) * 3_600_000);
}

export async function syncSimulatedPositions(force = false) {
  const now = Date.now();
  if (!force && now - lastSync < SYNC_THROTTLE_MS) return;
  lastSync = now;

  const loads = await db.load.findMany({
    where: { status: "IN_TRANSIT", truckId: { not: null } },
    include: { truck: true },
  });

  await Promise.all(
    loads.map((l) => {
      const t = l.truck!;
      if (t.pingSource === "DEVICE" && t.lastPingAt && now - t.lastPingAt.getTime() < DEVICE_FRESH_MS) return null;
      const a = { lat: l.originLat, lng: l.originLng };
      const b = { lat: l.destLat, lng: l.destLng };
      const p = loadProgress(l, now);
      const pos = pointOnRoute(a, b, p);
      const ahead = pointOnRoute(a, b, Math.min(1, p + 0.01));
      // deterministic-ish speed wobble so the fleet doesn't look robotic
      const wobble = Math.sin(now / 60_000 + t.unitNumber.charCodeAt(t.unitNumber.length - 1)) * 12;
      return db.truck.update({
        where: { id: t.id },
        data: {
          lat: pos.lat,
          lng: pos.lng,
          heading: p < 1 ? bearing(pos, ahead) : t.heading,
          speedKmh: p < 1 ? Math.round(72 + wobble) : 0,
          lastPingAt: new Date(now),
          pingSource: "SIMULATED",
        },
      });
    }),
  );
}

export async function fleetSnapshot() {
  await syncSimulatedPositions();
  const trucks = await db.truck.findMany({
    orderBy: { unitNumber: "asc" },
    include: {
      driver: { select: { id: true, name: true, phone: true, status: true } },
      loads: {
        where: { status: { in: ["IN_TRANSIT", "ASSIGNED"] } },
        orderBy: { pickupAt: "asc" },
        take: 1,
        include: { customer: { select: { name: true } } },
      },
    },
  });

  return trucks.map((t) => {
    const l = t.loads[0];
    const progress = l && l.status === "IN_TRANSIT" ? loadProgress(l) : 0;
    return {
      id: t.id,
      unitNumber: t.unitNumber,
      name: `${t.make} ${t.model}`,
      plate: t.plate,
      status: t.status,
      lat: t.lat,
      lng: t.lng,
      speedKmh: t.speedKmh ?? 0,
      heading: t.heading ?? 0,
      lastPingAt: t.lastPingAt?.toISOString() ?? null,
      pingSource: t.pingSource,
      driver: t.driver,
      load: l
        ? {
            id: l.id,
            reference: l.reference,
            status: l.status,
            customer: l.customer.name,
            originCity: l.originCity,
            destCity: l.destCity,
            progress,
            eta: estimatedArrival(l)?.toISOString() ?? null,
            deliveryAt: l.deliveryAt.toISOString(),
            route: routePolyline({ lat: l.originLat, lng: l.originLng }, { lat: l.destLat, lng: l.destLng }),
          }
        : null,
    };
  });
}

export type FleetSnapshot = Awaited<ReturnType<typeof fleetSnapshot>>;
