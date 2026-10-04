"use client";

import { useState, useTransition } from "react";
import { Ban, Printer } from "lucide-react";
import { setInvoiceStatus } from "@/app/actions/finance";
import { buttonClass, cn, IconButton } from "@/components/ui";

/**
 * Status controls for one invoice. `compact` is the table-row variant: the next step as a small
 * button plus a quiet void icon that appears on row hover; the full variant adds Print.
 */
export function InvoiceActions({ id, number, status, compact, readOnly }: {
  id: string; number: string; status: string; compact?: boolean;
  /** Viewer without finance.edit: only Print is offered. */
  readOnly?: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const size = compact ? "sm" : "md";

  const go = (next: string, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setError(null);
    start(async () => {
      try {
        await setInvoiceStatus(id, next);
      } catch {
        setError("Could not update the invoice. Reload the page and try again.");
      }
    });
  };

  const next = readOnly ? null : status === "DRAFT"
    ? { label: "Mark sent", pendingLabel: "Sending…", to: "SENT" }
    : status === "SENT"
      ? { label: "Record payment", pendingLabel: "Recording…", to: "PAID" }
      : null;
  const voidable = !readOnly && (status === "DRAFT" || status === "SENT");

  return (
    <div className={cn("flex items-center gap-1.5 print:hidden", compact ? "justify-end" : "flex-wrap gap-2")}>
      {next && (
        <button type="button" disabled={pending} onClick={() => go(next.to)} className={buttonClass(compact ? "secondary" : "primary", size)}>
          {pending ? next.pendingLabel : next.label}
        </button>
      )}
      {voidable && compact && (
        <IconButton label={`Void ${number}`} disabled={pending} onClick={() => go("VOID", `Void ${number}? The customer will not be asked to pay it.`)}
          className="opacity-0 transition-opacity hover:text-danger focus-visible:opacity-100 group-hover:opacity-100">
          <Ban />
        </IconButton>
      )}
      {voidable && !compact && (
        <button type="button" disabled={pending} onClick={() => go("VOID", `Void ${number}? The customer will not be asked to pay it.`)}
          className={cn(buttonClass("ghost", size), "text-danger hover:text-danger")}>
          <Ban />Void
        </button>
      )}
      {!compact && (
        <button type="button" onClick={() => window.print()} className={buttonClass("secondary", size)}>
          <Printer />Print
        </button>
      )}
      {error && <span role="alert" className="text-[11px] text-danger">{error}</span>}
    </div>
  );
}
