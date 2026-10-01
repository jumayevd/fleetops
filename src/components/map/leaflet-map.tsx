"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Polyline, Popup, CircleMarker, useMap } from "react-leaflet";
import { useEffect } from "react";

// Default: OpenStreetMap (fine for dev/low volume). For production traffic set a
// commercial tile provider via NEXT_PUBLIC_MAP_TILE_URL (e.g. MapTiler, Mapbox, Stadia).
const TILE_URL = process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION = process.env.NEXT_PUBLIC_MAP_TILE_ATTRIBUTION || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

export type MapTruck = {
  id: string;
  unitNumber: string;
  lat: number | null;
  lng: number | null;
  heading: number;
  speedKmh: number;
  status: string;
  driverName?: string | null;
  label?: string;
  route?: [number, number][];
  moving?: boolean;
};

export type MapPoint = { lat: number; lng: number; label: string; kind: "origin" | "dest" };

function truckIcon(t: MapTruck, selected: boolean) {
  const color = t.status !== "ACTIVE" ? "#f59e0b" : t.moving ? "#7c3aed" : "#2563eb";
  const size = selected ? 38 : 30;
  return L.divIcon({
    className: "truck-marker",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${color};border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;position:relative">
      ${t.moving ? `<div style="position:absolute;top:-7px;left:50%;transform:translateX(-50%) rotate(${t.heading}deg);transform-origin:50% ${size / 2 + 7}px;width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:8px solid ${color}"></div>` : ""}
      <svg width="${size * 0.5}" height="${size * 0.5}" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/></svg>
    </div>
    <div style="position:absolute;top:${size + 2}px;left:50%;transform:translateX(-50%);background:#0f172a;color:white;font-size:10px;font-weight:600;padding:1px 5px;border-radius:4px;white-space:nowrap">${t.unitNumber}</div>`,
  });
}

function FitBounds({ points, fitKey }: { points: [number, number][]; fitKey: string }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    const fit = () => {
      if (points.length === 1) map.setView(points[0], 9);
      else map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 10 });
    };
    fit();
    // The container can mount at 0px (hidden tab, flex/calc heights). Re-measure on
    // every resize, and refit when it grows from "too small to be useful".
    let wasTiny = map.getSize().x < 50 || map.getSize().y < 50;
    const ro = new ResizeObserver(() => {
      map.invalidateSize();
      const s = map.getSize();
      const tiny = s.x < 50 || s.y < 50;
      if (wasTiny && !tiny) fit();
      wasTiny = tiny;
    });
    ro.observe(map.getContainer());
    return () => ro.disconnect();
    // Only refit when the "subject" changes, not on every position tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, map]);
  return null;
}

function FlyTo({ target }: { target: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (!target) return;
    // Aim a bit right of the truck so it stays visible beside the detail panel.
    const zoom = Math.max(map.getZoom(), 8);
    const center = map.unproject(map.project(target, zoom).add([Math.min(170, map.getSize().x / 4), 0]), zoom);
    map.flyTo(center, zoom, { duration: 0.8 });
  }, [target, map]);
  return null;
}

export default function LeafletMap({ trucks = [], points = [], selectedId, onSelect, height = 520, fitKey = "all", flyTo = null }: {
  trucks?: MapTruck[];
  points?: MapPoint[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  height?: number | string;
  fitKey?: string;
  flyTo?: [number, number] | null;
}) {
  const positioned = trucks.filter((t) => t.lat != null && t.lng != null);
  const all: [number, number][] = [
    ...positioned.map((t) => [t.lat!, t.lng!] as [number, number]),
    ...points.map((p) => [p.lat, p.lng] as [number, number]),
  ];

  return (
    <div style={{ height }} className="overflow-hidden rounded-xl">
      <MapContainer center={[41.3, 69.24]} zoom={6} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
        <TileLayer attribution={TILE_ATTRIBUTION} url={TILE_URL} />
        <FitBounds points={all} fitKey={fitKey} />
        <FlyTo target={flyTo} />
        {positioned.map((t) =>
          t.route ? (
            <Polyline key={`r-${t.id}`} positions={t.route}
              pathOptions={{ color: t.id === selectedId ? "#7c3aed" : "#94a3b8", weight: t.id === selectedId ? 4 : 2, dashArray: "6 6", opacity: 0.9 }} />
          ) : null,
        )}
        {points.map((p, i) => (
          <CircleMarker key={i} center={[p.lat, p.lng]} radius={8}
            pathOptions={{ color: "white", weight: 3, fillColor: p.kind === "origin" ? "#10b981" : "#ef4444", fillOpacity: 1 }}>
            <Popup>{p.label}</Popup>
          </CircleMarker>
        ))}
        {positioned.map((t) => (
          <Marker key={t.id} position={[t.lat!, t.lng!]} icon={truckIcon(t, t.id === selectedId)}
            eventHandlers={{ click: () => onSelect?.(t.id) }} zIndexOffset={t.id === selectedId ? 1000 : 0}>
            {!onSelect && (
              <Popup>
                <b>{t.unitNumber}</b>
                {t.driverName && <><br />{t.driverName}</>}
                {t.label && <><br />{t.label}</>}
                <br />{Math.round(t.speedKmh)} km/h
              </Popup>
            )}
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
