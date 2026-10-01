"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { formatDistanceToNowStrict, format } from "date-fns";
import { Search, Radio, Phone, Gauge, MapPin } from "lucide-react";
import { LeafletMap, type MapTruck } from "./map";
import { Badge, Progress, inputClass } from "./ui";
import type { FleetSnapshot } from "@/lib/telemetry";

const POLL_MS = 10_000;

function useFleet(initial: FleetSnapshot) {
  const [trucks, setTrucks] = useState(initial);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const r = await fetch("/api/fleet", { cache: "no-store" });
        if (r.ok) {
          setTrucks((await r.json()).trucks);
          setUpdatedAt(new Date());
        }
      } catch { /* offline — keep last snapshot */ }
    }, POLL_MS);
    return () => clearInterval(id);
  }, []);
  return { trucks, updatedAt };
}

const toMap = (t: FleetSnapshot[number]): MapTruck => ({
  id: t.id, unitNumber: t.unitNumber, lat: t.lat, lng: t.lng, heading: t.heading, speedKmh: t.speedKmh,
  status: t.status, driverName: t.driver?.name, route: t.load?.status === "IN_TRANSIT" ? t.load.route : undefined,
  moving: t.speedKmh > 1, label: t.load ? `${t.load.reference}: ${t.load.originCity} → ${t.load.destCity}` : "Idle",
});

/** Compact live map for the dashboard. */
export function LiveFleetMini({ initial }: { initial: FleetSnapshot }) {
  const { trucks } = useFleet(initial);
  return <LeafletMap trucks={trucks.map(toMap)} height={360} />;
}

type Filter = "all" | "moving" | "idle" | "service";

/** Full control-tower view: list + map + detail panel. */
export function TrackingBoard({ initial }: { initial: FleetSnapshot }) {
  const { trucks, updatedAt } = useFleet(initial);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flyTo, setFlyTo] = useState<[number, number] | null>(null);

  const counts = useMemo(() => ({
    all: trucks.length,
    moving: trucks.filter((t) => t.speedKmh > 1).length,
    idle: trucks.filter((t) => t.speedKmh <= 1 && t.status === "ACTIVE").length,
    service: trucks.filter((t) => t.status !== "ACTIVE").length,
  }), [trucks]);

  const list = trucks.filter((t) => {
    const s = `${t.unitNumber} ${t.plate} ${t.driver?.name ?? ""} ${t.load?.reference ?? ""} ${t.load?.destCity ?? ""}`.toLowerCase();
    if (q && !s.includes(q.toLowerCase())) return false;
    if (filter === "moving") return t.speedKmh > 1;
    if (filter === "idle") return t.speedKmh <= 1 && t.status === "ACTIVE";
    if (filter === "service") return t.status !== "ACTIVE";
    return true;
  });
  const selected = trucks.find((t) => t.id === selectedId) ?? null;

  const select = (id: string) => {
    setSelectedId(id);
    const t = trucks.find((x) => x.id === id);
    if (t?.lat != null && t.lng != null) setFlyTo([t.lat, t.lng]);
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[340px_1fr]">
      <div className="flex max-h-[calc(100vh-190px)] flex-col rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="space-y-3 border-b border-slate-100 p-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Truck, driver, load, city…" className={clsx(inputClass, "pl-9")} />
          </div>
          <div className="grid grid-cols-4 gap-1 text-xs">
            {(["all", "moving", "idle", "service"] as Filter[]).map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className={clsx("rounded-md px-2 py-1.5 font-medium capitalize", filter === f ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>
                {f} <span className="opacity-60">{counts[f]}</span>
              </button>
            ))}
          </div>
        </div>
        <ul className="flex-1 divide-y divide-slate-100 overflow-y-auto">
          {list.map((t) => (
            <li key={t.id}>
              <button onClick={() => select(t.id)} className={clsx("w-full px-3 py-3 text-left hover:bg-slate-50", t.id === selectedId && "bg-blue-50/60")}>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 font-semibold text-slate-900">
                    <span className={clsx("h-2 w-2 rounded-full", t.status !== "ACTIVE" ? "bg-amber-500" : t.speedKmh > 1 ? "bg-violet-500" : "bg-blue-500")} />
                    {t.unitNumber}
                  </span>
                  <span className="text-xs text-slate-500">{t.speedKmh > 1 ? `${Math.round(t.speedKmh)} km/h` : t.status === "ACTIVE" ? "Parked" : "In service"}</span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">{t.driver?.name ?? "No driver"} · {t.plate}</p>
                {t.load && (
                  <div className="mt-2">
                    <p className="text-xs font-medium text-slate-700">{t.load.reference}: {t.load.originCity} → {t.load.destCity}</p>
                    {t.load.status === "IN_TRANSIT" && <Progress value={t.load.progress} className="mt-1.5" />}
                    {t.load.status === "ASSIGNED" && <p className="mt-1 text-xs text-blue-600">Awaiting pickup</p>}
                  </div>
                )}
              </button>
            </li>
          ))}
          {list.length === 0 && <li className="p-6 text-center text-sm text-slate-500">No trucks match.</li>}
        </ul>
        <div className="flex items-center gap-1.5 border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
          <Radio className="h-3.5 w-3.5 animate-pulse text-emerald-500" /> Live{updatedAt && ` · updated ${format(updatedAt, "HH:mm:ss")}`}
        </div>
      </div>

      <div className="relative">
        <LeafletMap trucks={trucks.map(toMap)} selectedId={selectedId} onSelect={select} height="calc(100vh - 190px)" flyTo={flyTo} />
        {selected && (
          <div className="absolute right-3 top-3 z-[500] w-80 rounded-xl border border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur">
            <div className="flex items-start justify-between">
              <div>
                <Link href={`/fleet/${selected.id}`} className="text-lg font-semibold text-slate-900 hover:underline">{selected.unitNumber}</Link>
                <p className="text-xs text-slate-500">{selected.name} · {selected.plate}</p>
              </div>
              <button onClick={() => setSelectedId(null)} className="text-slate-400 hover:text-slate-700" aria-label="Close">✕</button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg bg-slate-50 p-2"><Gauge className="mb-1 h-3.5 w-3.5 text-slate-400" />{Math.round(selected.speedKmh)} km/h</div>
              <div className="rounded-lg bg-slate-50 p-2"><MapPin className="mb-1 h-3.5 w-3.5 text-slate-400" />
                {selected.lastPingAt ? formatDistanceToNowStrict(new Date(selected.lastPingAt), { addSuffix: true }) : "no signal"}
                <span className="block text-[10px] text-slate-400">{selected.pingSource === "DEVICE" ? "Driver GPS" : "Route estimate"}</span>
              </div>
            </div>
            {selected.driver && (
              <div className="mt-3 flex items-center justify-between rounded-lg border border-slate-100 p-2 text-sm">
                <Link href={`/drivers/${selected.driver.id}`} className="font-medium hover:underline">{selected.driver.name}</Link>
                {selected.driver.phone && <a href={`tel:${selected.driver.phone}`} className="flex items-center gap-1 text-xs text-blue-600"><Phone className="h-3 w-3" />Call</a>}
              </div>
            )}
            {selected.load ? (
              <div className="mt-3 rounded-lg border border-slate-100 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <Link href={`/loads/${selected.load.id}`} className="font-semibold text-blue-700 hover:underline">{selected.load.reference}</Link>
                  <Badge value={selected.load.status} />
                </div>
                <p className="mt-1 text-xs text-slate-500">{selected.load.customer}</p>
                <p className="mt-2 font-medium">{selected.load.originCity} → {selected.load.destCity}</p>
                {selected.load.status === "IN_TRANSIT" && (
                  <>
                    <Progress value={selected.load.progress} className="mt-2" />
                    <div className="mt-2 flex justify-between text-xs text-slate-500">
                      <span>{Math.round(selected.load.progress * 100)}% complete</span>
                      {selected.load.eta && <span>ETA {format(new Date(selected.load.eta), "dd MMM HH:mm")}</span>}
                    </div>
                    {selected.load.eta && new Date(selected.load.eta) > new Date(selected.load.deliveryAt) && (
                      <p className="mt-2 rounded bg-rose-50 px-2 py-1 text-xs text-rose-700">Projected late vs. delivery window {format(new Date(selected.load.deliveryAt), "dd MMM HH:mm")}</p>
                    )}
                  </>
                )}
              </div>
            ) : <p className="mt-3 text-sm text-slate-500">No active load.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
