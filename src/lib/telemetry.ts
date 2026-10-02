import "server-only";
import { db } from "./db";
import { bearing, pathPolyline, pointAlongPolyline } from "./geo";
import { nearestCity } from "./constants";

/**
 * Telemetry: until real GPS devices / ELDs are integrated, trucks on an
 * in-transit load are simulated moving along their route (through every stop)
 * based on elapsed time. A real device ping (driver app, /api/telemetry/ping,
 * or a telematics provider) always wins over simulation for DEVICE_FRESH_MS.
 */
const AVG_SPEED_KMH = 58; // incl. stops, border crossings, rest breaks
const DEVICE_FRESH_MS = 5 * 60_000;
const SYNC_THROTTLE_MS = 10_000;
let lastSync = 0;

type RoutedLoad = { departedAt: Date | null; distanceKm: number; stops?: { lat: number; lng: number; seq: number }[]; originLat: number; originLng: number; destLat: number; destLng: number };

export function loadProgress(load: Pick<RoutedLoad, "departedAt" | "distanceKm">, now = Date.now()) {
  if (!load.departedAt) return 0;
  const durationMs = (load.distanceKm / AVG_SPEED_KMH) * 3_600_000;
  return Math.min(1, Math.max(0, (now - load.departedAt.getTime()) / durationMs));
}

export function estimatedArrival(load: Pick<RoutedLoad, "departedAt" | "distanceKm">) {
  if (!load.departedAt) return null;
  return new Date(load.departedAt.getTime() + (load.distanceKm / AVG_SPEED_KMH) * 3_600_000);
}

/** Route polyline through all stops (falls back to origin → destination). */
export function loadRoute(load: RoutedLoad): [number, number][] {
  const pts = load.stops && load.stops.length >= 2
    ? [...load.stops].sort((a, b) => a.seq - b.seq).map((s) => ({ lat: s.lat, lng: s.lng }))
    : [{ lat: load.originLat, lng: load.originLng }, { lat: load.destLat, lng: load.destLng }];
  return pathPolyline(pts);
}

export async function syncSimulatedPositions(force = false) {
  const now = Date.now();
  if (!force && now - lastSync < SYNC_THROTTLE_MS) return;
  lastSync = now;

  const loads = await db.load.findMany({
    where: { status: "IN_TRANSIT", truckId: { not: null } },
    include: { truck: true, stops: { select: { lat: true, lng: true, seq: true } } },
  });

  await Promise.all(
    loads.map(async (l) => {
      const t = l.truck!;
      if (t.pingSource && t.pingSource !== "SIMULATED" && t.lastPingAt && now - t.lastPingAt.getTime() < DEVICE_FRESH_MS) return;
      const route = loadRoute(l);
      const p = loadProgress(l, now);
      const pos = pointAlongPolyline(route, p);
      const ahead = pointAlongPolyline(route, Math.min(1, p + 0.01));
      // deterministic-ish speed wobble so the fleet doesn't look robotic
      const wobble = Math.sin(now / 60_000 + t.unitNumber.charCodeAt(t.unitNumber.length - 1)) * 12;
      const fuelPct = Math.max(6, Math.round(92 - p * (l.distanceKm / 9)));
      await db.truck.update({
        where: { id: t.id },
        data: {
          lat: pos.lat, lng: pos.lng,
          heading: p < 1 ? bearing(pos, ahead) : t.heading,
          speedKmh: p < 1 ? Math.round(72 + wobble) : 0,
          engineOn: p < 1,
          fuelPct,
          locationName: nearestCity(pos.lat, pos.lng).label,
          lastPingAt: new Date(now),
          pingSource: "SIMULATED",
        },
      });
      // A paired trailer travels with the tractor.
      if (l.trailerId) {
        await db.trailer.update({ where: { id: l.trailerId }, data: { lat: pos.lat, lng: pos.lng, locationName: nearestCity(pos.lat, pos.lng).label, lastPingAt: new Date(now) } }).catch(() => undefined);
      }
    }),
  );

  // Idle trucks: fill in a location label once so lists never show blanks.
  const unlabeled = await db.truck.findMany({ where: { locationName: null, lat: { not: null } }, select: { id: true, lat: true, lng: true } });
  await Promise.all(unlabeled.map((t) => db.truck.update({ where: { id: t.id }, data: { locationName: nearestCity(t.lat!, t.lng!).label, speedKmh: 0, engineOn: false } })));
}

export async function fleetSnapshot() {
  await syncSimulatedPositions();
  const trucks = await db.truck.findMany({
    where: { status: { not: "INACTIVE" } },
    orderBy: { unitNumber: "asc" },
    include: {
      driver: { select: { id: true, name: true, phone: true, boardStatus: true, hold: true, team: { select: { name: true } } } },
      loads: {
        where: { status: { in: ["IN_TRANSIT", "ASSIGNED"] } },
        orderBy: { pickupAt: "asc" },
        take: 1,
        include: { customer: { select: { name: true } }, stops: { orderBy: { seq: "asc" } } },
      },
    },
  });

  return trucks.map((t) => {
    const l = t.loads[0];
    const progress = l && l.status === "IN_TRANSIT" ? loadProgress(l) : 0;
    const nextStop = l?.stops.find((s) => s.status !== "DONE");
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
      fuelPct: t.fuelPct,
      engineOn: t.engineOn ?? false,
      locationName: t.locationName,
      lastPingAt: t.lastPingAt?.toISOString() ?? null,
      pingSource: t.pingSource,
      driver: t.driver ? { id: t.driver.id, name: t.driver.name, phone: t.driver.phone, boardStatus: t.driver.boardStatus, hold: t.driver.hold, team: t.driver.team?.name ?? null } : null,
      load: l
        ? {
            id: l.id,
            reference: l.reference,
            status: l.status,
            customer: l.customer.name,
            originCity: l.originCity,
            destCity: l.destCity,
            nextStop: nextStop ? { type: nextStop.type, name: nextStop.name, city: nextStop.city, windowEnd: (nextStop.windowEnd ?? nextStop.windowStart)?.toISOString() ?? null } : null,
            stops: l.stops.map((s) => ({ lat: s.lat, lng: s.lng, type: s.type, status: s.status, name: s.name })),
            progress,
            eta: estimatedArrival(l)?.toISOString() ?? null,
            deliveryAt: l.deliveryAt.toISOString(),
            route: loadRoute(l),
          }
        : null,
    };
  });
}

export type FleetSnapshot = Awaited<ReturnType<typeof fleetSnapshot>>;
