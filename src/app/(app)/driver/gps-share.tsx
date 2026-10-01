"use client";

import { useEffect, useRef, useState } from "react";
import { Navigation, NavigationOff } from "lucide-react";
import { buttonClass } from "@/components/ui";

const SEND_EVERY_MS = 20_000;

/** Shares the phone's GPS with dispatch while the page is open. */
export function GpsShare() {
  const [on, setOn] = useState(false);
  const [status, setStatus] = useState<string>("Location sharing is off");
  const watch = useRef<number | null>(null);
  const lastSent = useRef(0);

  const stop = () => {
    if (watch.current != null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
    setOn(false);
    setStatus("Location sharing is off");
  };

  const start = () => {
    if (!("geolocation" in navigator)) {
      setStatus("This device doesn't support GPS");
      return;
    }
    setOn(true);
    setStatus("Waiting for GPS fix…");
    lastSent.current = 0;
    watch.current = navigator.geolocation.watchPosition(
      async (pos) => {
        if (Date.now() - lastSent.current < SEND_EVERY_MS) return;
        lastSent.current = Date.now();
        const body = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          speedKmh: pos.coords.speed != null ? Math.max(0, pos.coords.speed * 3.6) : undefined,
          heading: pos.coords.heading != null && !Number.isNaN(pos.coords.heading) ? pos.coords.heading : undefined,
        };
        const r = await fetch("/api/telemetry/ping", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
        const data = r ? await r.json().catch(() => ({})) : {};
        setStatus(r?.ok ? `Sharing live · last sent ${new Date().toLocaleTimeString()}` : `Couldn't send: ${data.error ?? "offline"}`);
      },
      (err) => setStatus(err.code === err.PERMISSION_DENIED ? "Location permission denied" : "GPS unavailable"),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 },
    );
  };

  // Stop watching when the driver leaves the page.
  useEffect(() => () => {
    if (watch.current != null) navigator.geolocation.clearWatch(watch.current);
  }, []);

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div>
        <p className="text-sm font-semibold text-slate-800">Live location</p>
        <p className="text-xs text-slate-500">{status}</p>
      </div>
      <button onClick={on ? stop : start} className={buttonClass(on ? "secondary" : "primary")}>
        {on ? <><NavigationOff className="h-4 w-4" />Stop</> : <><Navigation className="h-4 w-4" />Share</>}
      </button>
    </div>
  );
}
