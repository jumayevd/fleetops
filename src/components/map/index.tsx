"use client";

import dynamic from "next/dynamic";

// Leaflet touches `window`, so it can only render on the client.
export const LeafletMap = dynamic(() => import("./leaflet-map"), {
  ssr: false,
  loading: () => <div className="h-full min-h-64 animate-pulse rounded-xl bg-slate-100" />,
});

export type { MapTruck, MapPoint } from "./leaflet-map";
