"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { CLAIM_FAULTS, CLAIM_FAULT_LABELS, CLAIM_SEVERITIES, CLAIM_STATUSES, CLAIM_TYPES, CLAIM_TYPE_LABELS } from "@/lib/constants";
import { buttonClass, cn, inputClass } from "@/components/ui";
import { CLAIM_SEVERITY_LABELS, CLAIM_STATUS_LABELS, claimsHref, hasClaimFilters, isOpenClaimStatus, type ClaimFilters } from "./shared";

/**
 * Filter bar. Everything lives in the URL (shareable, back-button friendly): selects apply
 * immediately, search is debounced and also applies on Enter. The server does the filtering.
 */
export function ClaimFilterBar({ values }: { values: ClaimFilters }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(values.q);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const go = (patch: Partial<Record<keyof ClaimFilters, string | undefined>>) => {
    start(() => router.replace(claimsHref(values, patch)));
  };
  const onSearch = (v: string) => {
    setQ(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => go({ q: v.trim() || undefined }), 300);
  };
  const select = cn(inputClass, "h-7 w-auto min-w-0 pr-7 text-[12px]");
  const muted = (v: string | undefined) => (!v ? "text-fg-muted" : undefined);
  const openStatuses = CLAIM_STATUSES.filter(isOpenClaimStatus);
  const closedStatuses = CLAIM_STATUSES.filter((s) => !isOpenClaimStatus(s));

  return (
    <div className={cn("flex flex-wrap items-center gap-2", pending && "opacity-70")} aria-busy={pending || undefined}>
      <label className="relative block">
        <Search className="pointer-events-none absolute inset-y-0 left-2 my-auto h-3.5 w-3.5 text-fg-subtle" />
        <input value={q} onChange={(e) => onSearch(e.target.value)} placeholder="Number, load, driver, unit, location…" aria-label="Search claims"
          onKeyDown={(e) => { if (e.key === "Enter") { if (timer.current) clearTimeout(timer.current); go({ q: q.trim() || undefined }); } }}
          className={cn(inputClass, "h-7 w-64 pl-7 pr-7 text-[12px]")} />
        {q && (
          <button type="button" aria-label="Clear search" onClick={() => onSearch("")}
            className="absolute inset-y-0 right-1 my-auto inline-flex h-5 w-5 items-center justify-center rounded text-fg-subtle hover:bg-raised hover:text-fg">
            <X className="h-3 w-3" />
          </button>
        )}
      </label>

      <select aria-label="Claim type" value={values.type ?? ""} onChange={(e) => go({ type: e.target.value || undefined })} className={cn(select, muted(values.type))}>
        <option value="">All types</option>
        {CLAIM_TYPES.map((t) => <option key={t} value={t}>{CLAIM_TYPE_LABELS[t]}</option>)}
      </select>

      <select aria-label="Status" value={values.status ?? ""} onChange={(e) => go({ status: e.target.value || undefined })} className={cn(select, muted(values.status))}>
        <option value="">All statuses</option>
        <option value="open">Open (any)</option>
        <option value="closed">Closed (any)</option>
        <optgroup label="Open">{openStatuses.map((s) => <option key={s} value={s}>{CLAIM_STATUS_LABELS[s]}</option>)}</optgroup>
        <optgroup label="Closed">{closedStatuses.map((s) => <option key={s} value={s}>{CLAIM_STATUS_LABELS[s]}</option>)}</optgroup>
      </select>

      <select aria-label="Severity" value={values.severity ?? ""} onChange={(e) => go({ severity: e.target.value || undefined })} className={cn(select, muted(values.severity))}>
        <option value="">All severities</option>
        {CLAIM_SEVERITIES.map((s) => <option key={s} value={s}>{CLAIM_SEVERITY_LABELS[s] ?? s}</option>)}
      </select>

      <select aria-label="Fault" value={values.fault ?? ""} onChange={(e) => go({ fault: e.target.value || undefined })} className={cn(select, muted(values.fault))}>
        <option value="">Any fault</option>
        {CLAIM_FAULTS.map((f) => <option key={f} value={f}>{CLAIM_FAULT_LABELS[f]}</option>)}
      </select>

      {hasClaimFilters(values) && (
        <button type="button" onClick={() => { setQ(""); go({ type: undefined, status: undefined, severity: undefined, fault: undefined, q: undefined }); }}
          className={buttonClass("ghost", "sm")}>
          <X className="h-3.5 w-3.5" />Clear
        </button>
      )}
    </div>
  );
}
