"use client";

import { useState, useTransition } from "react";
import { Check, Play, X } from "lucide-react";
import { setWorkOrderStatus } from "@/app/actions/fleet";
import { Button, cn } from "@/components/ui";

/**
 * Status buttons for a work order row or header.
 * Draft / open → Start (in progress). In progress → Complete (done). Anything not finished → Cancel.
 * The server action applies the side effects (unit into / out of the shop, PM interval reset).
 */
export function WorkOrderStatusButtons({ id, status, number, size = "sm", compact, className }: {
  id: string;
  status: string;
  /** Shown in the cancel confirmation. */
  number?: number;
  size?: "sm" | "md";
  /** Icon-only cancel (for dense table rows). */
  compact?: boolean;
  className?: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (status === "DONE" || status === "CANCELLED") return null;

  const go = (to: string) =>
    start(async () => {
      setError(null);
      try {
        await setWorkOrderStatus(id, to);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not update the work order");
      }
    });

  const inProgress = status === "IN_PROGRESS";
  const Icon = inProgress ? Check : Play;

  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <Button size={size} variant={inProgress ? "success" : "secondary"} disabled={pending} onClick={() => go(inProgress ? "DONE" : "IN_PROGRESS")}
        title={inProgress ? "Mark done and release the unit" : "Start work and put the unit in the shop"}>
        <Icon />{pending ? "Saving…" : inProgress ? "Complete" : "Start"}
      </Button>
      <Button size={size} variant="ghost" disabled={pending} aria-label="Cancel work order" title="Cancel work order"
        onClick={() => { if (window.confirm(`Cancel work order${number ? ` #${number}` : ""}? The unit stays as it is and the record is kept for history.`)) go("CANCELLED"); }}>
        <X />{!compact && "Cancel"}
      </Button>
      {error && <span role="alert" className="text-[11px] text-danger">{error}</span>}
    </span>
  );
}
