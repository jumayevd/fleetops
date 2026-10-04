"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { buttonClass, cn, inputClass } from "@/components/ui";
import { auditHref, type AuditFilterParams } from "./shared";

type Opt = { value: string; label: string };

/**
 * Filter bar for the audit log. Everything lives in the URL: selects and dates apply at once,
 * the search box is debounced. The server does the filtering and the paging.
 */
export function AuditFilters({ params, users, actions }: { params: AuditFilterParams; users: Opt[]; actions: Opt[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(params.q ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const go = (patch: Partial<AuditFilterParams>) => start(() => router.replace(auditHref(params, patch)));
  const onSearch = (v: string) => {
    setQ(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => go({ q: v.trim() || undefined }), 300);
  };
  const active = Boolean(params.user || params.action || params.from || params.to || params.q);
  const select = cn(inputClass, "h-7 w-auto min-w-32 pr-7 text-[12px]");
  const dateInput = cn(inputClass, "num h-7 w-36 text-[12px]");

  return (
    <div className={cn("flex flex-wrap items-center gap-2", pending && "opacity-70")} aria-busy={pending || undefined}>
      <label className="relative block">
        <Search className="pointer-events-none absolute inset-y-0 left-2 my-auto h-3.5 w-3.5 text-fg-subtle" />
        <input value={q} onChange={(e) => onSearch(e.target.value)} placeholder="Search details…" aria-label="Search details"
          onKeyDown={(e) => { if (e.key === "Enter") { if (timer.current) clearTimeout(timer.current); go({ q: q.trim() || undefined }); } }}
          className={cn(inputClass, "h-7 w-56 pl-7 pr-7 text-[12px]")} />
        {q && (
          <button type="button" aria-label="Clear search" onClick={() => onSearch("")}
            className="absolute inset-y-0 right-1 my-auto inline-flex h-5 w-5 items-center justify-center rounded text-fg-subtle hover:bg-raised hover:text-fg">
            <X className="h-3 w-3" />
          </button>
        )}
      </label>

      <select aria-label="User" value={params.user ?? ""} onChange={(e) => go({ user: e.target.value || undefined })} className={cn(select, !params.user && "text-fg-muted")}>
        <option value="">Everyone</option>
        {users.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
        <option value="system">System (automatic)</option>
      </select>
      <select aria-label="Action" value={params.action ?? ""} onChange={(e) => go({ action: e.target.value || undefined })} className={cn(select, !params.action && "text-fg-muted")}>
        <option value="">All actions</option>
        {actions.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
      </select>

      <span className="inline-flex items-center gap-1 text-[12px] text-fg-subtle">
        <input type="date" aria-label="From date" value={params.from ?? ""} max={params.to || undefined} onChange={(e) => go({ from: e.target.value || undefined })} className={dateInput} />
        <span>–</span>
        <input type="date" aria-label="To date" value={params.to ?? ""} min={params.from || undefined} onChange={(e) => go({ to: e.target.value || undefined })} className={dateInput} />
      </span>

      {active && (
        <button type="button" onClick={() => { setQ(""); start(() => router.replace(auditHref({ entity: params.entity }))); }} className={buttonClass("ghost", "sm")}>
          <X className="h-3.5 w-3.5" />Clear
        </button>
      )}
    </div>
  );
}
