"use client";

import { useTransition } from "react";
import { setMaintenanceStatus } from "@/app/actions/fleet";
import { buttonClass } from "@/components/ui";

export function MaintenanceActions({ id, status }: { id: string; status: string }) {
  const [pending, start] = useTransition();
  if (status === "DONE") return null;
  const next = status === "SCHEDULED" ? { to: "IN_PROGRESS", label: "Start" } : { to: "DONE", label: "Complete" };
  return (
    <button disabled={pending} onClick={() => start(() => setMaintenanceStatus(id, next.to))}
      className={buttonClass(next.to === "DONE" ? "success" : "secondary", "sm")}>
      {pending ? "…" : next.label}
    </button>
  );
}
