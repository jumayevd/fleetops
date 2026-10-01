export type LatLng = { lat: number; lng: number };

export function haversineKm(a: LatLng, b: LatLng) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Road distance estimate: great-circle distance × typical road detour factor. */
export function roadKm(a: LatLng, b: LatLng) {
  return Math.round(haversineKm(a, b) * 1.25);
}

// Routes are drawn as a gentle quadratic curve so lines don't look like rulers.
function controlPoint(a: LatLng, b: LatLng): LatLng {
  const mid = { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
  const dx = b.lng - a.lng;
  const dy = b.lat - a.lat;
  return { lat: mid.lat - dx * 0.12, lng: mid.lng + dy * 0.12 };
}

export function pointOnRoute(a: LatLng, b: LatLng, t: number): LatLng {
  const c = controlPoint(a, b);
  const u = 1 - t;
  return {
    lat: u * u * a.lat + 2 * u * t * c.lat + t * t * b.lat,
    lng: u * u * a.lng + 2 * u * t * c.lng + t * t * b.lng,
  };
}

export function routePolyline(a: LatLng, b: LatLng, steps = 32): [number, number][] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const p = pointOnRoute(a, b, i / steps);
    return [p.lat, p.lng];
  });
}

export function bearing(a: LatLng, b: LatLng) {
  const y = Math.sin(((b.lng - a.lng) * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180);
  const x =
    Math.cos((a.lat * Math.PI) / 180) * Math.sin((b.lat * Math.PI) / 180) -
    Math.sin((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.cos(((b.lng - a.lng) * Math.PI) / 180);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
