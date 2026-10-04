"use client";

import { useState, useTransition } from "react";
import { CircleCheck, Home, Moon, Route, type LucideIcon } from "lucide-react";
import { cn } from "@/components/ui";
import { setDriverStatus } from "@/app/actions/driver";
import { BOARD_STATUS_LABELS, type BoardStatus } from "@/lib/constants";

type Value = "READY" | "REST" | "HOME";
const OPTIONS: { value: Value; label: string; hint: string; icon: LucideIcon }[] = [
  { value: "READY", label: "Ready", hint: "You are available — dispatch can give you the next load.", icon: CircleCheck },
  { value: "REST", label: "Rest", hint: "Off duty for a break. Dispatch will not plan you until you are back to Ready.", icon: Moon },
  { value: "HOME", label: "Home", hint: "Home time. Dispatch will not plan you until you are back to Ready.", icon: Home },
];

/** READY / REST / HOME self-service. Locked while a trip is in progress — the board then follows the stops. */
export function StatusToggle({ status, since, onTrip }: { status: string; since: string; onTrip: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const selected = OPTIONS.find((o) => o.value === status) ?? null;
  const label = BOARD_STATUS_LABELS[status as BoardStatus] ?? status;

  const choose = (value: Value) => {
    if (pending || onTrip || value === selected?.value) return;
    setError(null);
    start(async () => {
      try {
        await setDriverStatus(value);
      } catch {
        setError("Could not update your status — check your connection and try again.");
      }
    });
  };

  return (
    <section aria-label="My status" className="rounded-lg border border-line bg-surface p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[13px] font-semibold text-fg">My status</p>
        <p className="truncate text-[12px] text-fg-muted">
          {label} <span className="text-fg-subtle">· since {since}</span>
        </p>
      </div>
      <div role="radiogroup" aria-label="Availability" aria-busy={pending || undefined}
        className={cn("grid grid-cols-3 gap-1 rounded-md bg-sunken p-1", onTrip && "opacity-60")}>
        {OPTIONS.map((o) => {
          const Icon = o.icon;
          const active = o.value === selected?.value;
          return (
            <button key={o.value} type="button" role="radio" aria-checked={active} disabled={pending || onTrip} onClick={() => choose(o.value)}
              className={cn(
                "flex h-12 flex-col items-center justify-center gap-0.5 rounded text-[13px] font-medium transition-colors disabled:cursor-not-allowed",
                active ? "bg-primary text-on-primary" : "text-fg-muted hover:bg-surface hover:text-fg",
              )}>
              <Icon className="h-4 w-4" />
              {o.label}
            </button>
          );
        })}
      </div>
      <p className="mt-2 flex items-start gap-1.5 text-[12px] leading-4 text-fg-subtle">
        {onTrip && <Route className="mt-px h-3.5 w-3.5 shrink-0" />}
        <span>
          {onTrip
            ? "Your status follows the trip while you are driving — it updates as you arrive at and complete stops."
            : selected?.hint ?? "Pick Ready, Rest or Home so dispatch knows your availability."}
        </span>
      </p>
      {error && <p className="mt-1 text-[12px] text-danger" role="alert">{error}</p>}
    </section>
  );
}
