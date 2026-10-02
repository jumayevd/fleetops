"use client";

import { useState, useTransition } from "react";
import { ChevronDown, ArrowLeft } from "lucide-react";
import { setTrailerStatus } from "@/app/actions/fleet";
import { TRAILER_STATUSES, TRAILER_STATUS_LABELS } from "@/lib/constants";
import { Badge, STATUS_TONE, StatusDot, buttonClass, cn, inputClass } from "@/components/ui";
import { Popover, menuItemClass } from "../menu";

/** Statuses that describe where the trailer is, so we ask for the place. */
const ASKS_LOCATION = new Set(["DROPPED", "YARD"]);

/**
 * Inline status change: the badge is the trigger, a quiet popover lists the other statuses.
 * Dropped / Yard ask where the unit is (one input, Enter to confirm). Errors stay inside the popover.
 */
export function TrailerStatusControl({ id, status, locationName, editable, since }: {
  id: string; status: string; locationName: string | null; editable: boolean; since?: string;
}) {
  if (!editable) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <Badge value={status} label={TRAILER_STATUS_LABELS[status] ?? status} dot />
        {since && <span className="num text-[11px] text-fg-subtle" title="Time in this status">{since}</span>}
      </span>
    );
  }
  return (
    <Popover width={232} align="start" trigger={({ open, toggle, ref }) => (
      <span className="inline-flex items-center gap-1.5">
        <button ref={ref} type="button" onClick={toggle} aria-haspopup="menu" aria-expanded={open} title="Change status"
          className={cn("inline-flex items-center gap-1 rounded-md py-0.5 pl-0.5 pr-1 transition-colors hover:bg-raised focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40", open && "bg-raised")}>
          <Badge value={status} label={TRAILER_STATUS_LABELS[status] ?? status} dot />
          <ChevronDown className="h-3 w-3 text-fg-subtle" />
        </button>
        {since && <span className="num text-[11px] text-fg-subtle" title="Time in this status">{since}</span>}
      </span>
    )}>
      {(close) => <StatusPanel id={id} status={status} locationName={locationName} close={close} />}
    </Popover>
  );
}

function StatusPanel({ id, status, locationName, close }: { id: string; status: string; locationName: string | null; close: () => void }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState<string | null>(null);
  const [place, setPlace] = useState(locationName ?? "");

  const run = (next: string, where?: string) => start(async () => {
    setError(null);
    try { await setTrailerStatus(id, next, where?.trim() || undefined); close(); }
    catch (e) { setError(e instanceof Error && e.message ? e.message : "Could not change status"); }
  });

  if (picking) {
    return (
      <form className="p-1" onSubmit={(e) => { e.preventDefault(); run(picking, place); }}>
        <button type="button" onClick={() => setPicking(null)} className="mb-1 inline-flex items-center gap-1 text-[11px] text-fg-subtle hover:text-fg"><ArrowLeft className="h-3 w-3" />Back</button>
        <p className="mb-1.5 text-[12px] font-medium text-fg">{TRAILER_STATUS_LABELS[picking]} — where?</p>
        <input autoFocus value={place} onChange={(e) => setPlace(e.target.value)} placeholder={picking === "YARD" ? "Tashkent yard" : "Customer yard, city"} className={cn(inputClass, "h-7 text-[12px]")} />
        <div className="mt-2 flex items-center justify-between gap-2">
          {error ? <span role="alert" className="truncate text-[11px] text-danger" title={error}>{error}</span> : <span className="text-[11px] text-fg-subtle">Leave empty to keep the current place</span>}
          <button type="submit" disabled={pending} className={buttonClass("primary", "sm")}>{pending ? "Saving…" : "Confirm"}</button>
        </div>
      </form>
    );
  }

  return (
    <div>
      <p className="px-2 pb-1 pt-1 text-[11px] text-fg-subtle">Set status</p>
      <ul role="menu" className="space-y-px">
        {TRAILER_STATUSES.map((s) => (
          <li key={s} role="none">
            <button type="button" role="menuitem" disabled={pending || s === status}
              onClick={() => (ASKS_LOCATION.has(s) ? setPicking(s) : run(s))}
              className={cn(menuItemClass, s === status && "bg-raised font-medium")}>
              <StatusDot tone={STATUS_TONE[s] ?? "neutral"} />
              <span className="flex-1">{TRAILER_STATUS_LABELS[s]}</span>
              {s === status && <span className="text-[10px] text-fg-subtle">current</span>}
              {ASKS_LOCATION.has(s) && s !== status && <span className="text-[10px] text-fg-subtle">asks where</span>}
            </button>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="mt-1 rounded bg-danger-soft px-2 py-1 text-[11px] text-danger">{error}</p>}
      <p className="mt-1 border-t border-line px-2 pt-1.5 text-[10px] leading-4 text-fg-subtle">Leaving In use unpairs the truck. Units on an active load must stay In use.</p>
    </div>
  );
}
