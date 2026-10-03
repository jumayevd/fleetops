"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui";
import { updateStop } from "@/app/actions/loads";

/** Dispatcher marks a stop arrived / complete on the driver's behalf. Completing the final stop delivers the load. */
export function StopActions({ loadId, stopId, status, isLast }: { loadId: string; stopId: string; status: string; isLast: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (action: "arrive" | "complete") => {
    setError(null);
    start(async () => {
      try {
        await updateStop(loadId, stopId, action);
      } catch (e) {
        setError(e instanceof Error && e.message ? e.message : "Could not update the stop — reload and try again.");
      }
    });
  };
  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1" aria-busy={pending || undefined}>
        {status === "PENDING" && (
          <Button size="sm" variant="secondary" disabled={pending} onClick={() => run("arrive")}>Arrive</Button>
        )}
        <Button size="sm" variant={status === "ARRIVED" ? "primary" : "secondary"} disabled={pending} onClick={() => run("complete")}
          title={isLast ? "Completing the final delivery marks the load delivered" : undefined}>
          {pending ? "Saving…" : "Complete"}
        </Button>
      </div>
      {error && <p className="max-w-56 text-right text-[11px] text-danger">{error}</p>}
    </div>
  );
}
