"use client";

import { useState, useTransition } from "react";
import { setWorkOrderStatus } from "@/app/actions/fleet";
import { buttonClass, type ButtonVariant } from "@/components/ui";

const NEXT: Record<string, { to: string; label: string; variant: ButtonVariant }> = {
  DRAFT: { to: "OPEN", label: "Open", variant: "secondary" },
  OPEN: { to: "IN_PROGRESS", label: "Start", variant: "secondary" },
  IN_PROGRESS: { to: "DONE", label: "Complete", variant: "success" },
};

/** One-click advance (Open → Start → Complete) plus a quiet cancel while the job hasn't started. */
export function WorkOrderActions({ id, status, size = "sm" }: { id: string; status: string; size?: "sm" | "md" }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const next = NEXT[status];
  if (!next) return null;
  const run = (to: string, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    start(async () => {
      setError(null);
      try { await setWorkOrderStatus(id, to); }
      catch (e) { setError(e instanceof Error && e.message ? e.message : "Could not update the work order"); }
    });
  };
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap" data-no-row-link="">
      <button type="button" disabled={pending} onClick={() => run(next.to)} className={buttonClass(next.variant, size)}>{pending ? "…" : next.label}</button>
      {status !== "IN_PROGRESS" && (
        <button type="button" disabled={pending} onClick={() => run("CANCELLED", "Cancel this work order?")} className={buttonClass("ghost", size)}>Cancel</button>
      )}
      {error && <span role="alert" className="text-[11px] text-danger">{error}</span>}
    </span>
  );
}
