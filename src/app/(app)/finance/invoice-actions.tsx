"use client";

import { useTransition } from "react";
import { Printer } from "lucide-react";
import { setInvoiceStatus } from "@/app/actions/finance";
import { buttonClass } from "@/components/ui";

export function InvoiceActions({ id, status, compact }: { id: string; status: string; compact?: boolean }) {
  const [pending, start] = useTransition();
  const size = compact ? "sm" : "md";
  const go = (s: string, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    start(() => setInvoiceStatus(id, s));
  };
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      {status === "DRAFT" && <button disabled={pending} onClick={() => go("SENT")} className={buttonClass("primary", size)}>Mark sent</button>}
      {status === "SENT" && <button disabled={pending} onClick={() => go("PAID")} className={buttonClass("success", size)}>Record payment</button>}
      {!compact && ["DRAFT", "SENT"].includes(status) && (
        <button disabled={pending} onClick={() => go("VOID", "Void this invoice?")} className={buttonClass("ghost", size) + " text-rose-600"}>Void</button>
      )}
      {!compact && <button onClick={() => window.print()} className={buttonClass("secondary", size)}><Printer className="h-4 w-4" />Print / PDF</button>}
    </div>
  );
}
