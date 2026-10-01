"use client";

import { useTransition } from "react";
import clsx from "clsx";
import { setDriverStatus } from "@/app/actions/driver";

const OPTIONS = [
  { value: "AVAILABLE", label: "Available" },
  { value: "ON_DUTY", label: "On duty" },
  { value: "OFF_DUTY", label: "Off duty" },
];

export function StatusToggle({ status }: { status: string }) {
  const [pending, start] = useTransition();
  if (status === "DRIVING" || status === "ON_LEAVE") {
    return <p className="rounded-lg bg-violet-50 px-3 py-2 text-center text-sm font-medium text-violet-700">{status === "DRIVING" ? "Driving — on a trip" : "On leave"}</p>;
  }
  return (
    <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
      {OPTIONS.map((o) => (
        <button key={o.value} disabled={pending} onClick={() => start(() => setDriverStatus(o.value))}
          className={clsx("rounded-lg py-2 text-sm font-medium transition", status === o.value ? "bg-white text-slate-900 shadow" : "text-slate-500")}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
