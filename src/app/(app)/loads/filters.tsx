"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { BILLING_STAGES, BILLING_STAGE_LABELS } from "@/lib/constants";
import { buttonClass, cn, inputClass } from "@/components/ui";

export type FilterValues = { view: string; status?: string; billing?: string; team?: string; party?: string; from?: string; to?: string; q: string };
type Party = { id: string; label: string };

/**
 * Filter bar. Every control writes to the URL (shareable, back-button friendly):
 * selects apply immediately, the search box applies on Enter.
 */
export function LoadFilterBar({ values, teams, customers, brokers }: {
  values: FilterValues; teams: { id: string; name: string }[]; customers: Party[]; brokers: Party[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(values.q);

  const apply = (patch: Partial<FilterValues>) => {
    const merged = { ...values, ...patch };
    const p = new URLSearchParams();
    if (merged.view === "board") p.set("view", "board");
    for (const k of ["status", "billing", "team", "party", "from", "to", "q"] as const) {
      const v = merged[k];
      if (v) p.set(k, v);
    }
    const s = p.toString();
    start(() => router.replace(s ? `/loads?${s}` : "/loads"));
  };
  const active = Boolean(values.status || values.billing || values.team || values.party || values.from || values.to || values.q);
  const select = cn(inputClass, "w-auto min-w-0 pr-7");

  return (
    <div className={cn("flex flex-wrap items-center gap-2", pending && "opacity-70")} aria-busy={pending || undefined}>
      <form className="relative" onSubmit={(e) => { e.preventDefault(); apply({ q }); }}>
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-faint" />
        <input name="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search reference, city, customer, driver, truck…"
          aria-label="Search loads" className={cn(inputClass, "w-72 pl-8 pr-7")} />
        {q && (
          <button type="button" aria-label="Clear search" onClick={() => { setQ(""); apply({ q: "" }); }}
            className="absolute right-1.5 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-fg-subtle hover:bg-sunken hover:text-fg">
            <X className="h-3 w-3" />
          </button>
        )}
      </form>

      <select aria-label="Billing stage" value={values.billing ?? ""} onChange={(e) => apply({ billing: e.target.value })} className={select}>
        <option value="">Billing: any</option>
        {BILLING_STAGES.filter((s) => s !== "NONE").map((s) => <option key={s} value={s}>{BILLING_STAGE_LABELS[s]}</option>)}
      </select>

      <select aria-label="Team" value={values.team ?? ""} onChange={(e) => apply({ team: e.target.value })} className={select}>
        <option value="">Team: all</option>
        {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        <option value="none">No team</option>
      </select>

      <select aria-label="Customer or broker" value={values.party ?? ""} onChange={(e) => apply({ party: e.target.value })} className={cn(select, "max-w-56")}>
        <option value="">Customer / broker: all</option>
        {customers.length > 0 && <optgroup label="Customers">{customers.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</optgroup>}
        {brokers.length > 0 && <optgroup label="Brokers">{brokers.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</optgroup>}
      </select>

      <div className="flex items-center gap-1">
        <input type="date" aria-label="Pickup from" value={values.from ?? ""} onChange={(e) => apply({ from: e.target.value })} className={cn(inputClass, "num w-36")} />
        <span className="text-[12px] text-fg-faint">–</span>
        <input type="date" aria-label="Pickup until" value={values.to ?? ""} min={values.from} onChange={(e) => apply({ to: e.target.value })} className={cn(inputClass, "num w-36")} />
      </div>

      {active && (
        <button type="button" onClick={() => { setQ(""); apply({ status: "", billing: "", team: "", party: "", from: "", to: "", q: "" }); }}
          className={buttonClass("ghost", "sm")}>
          <X className="h-3.5 w-3.5" />Clear filters
        </button>
      )}
    </div>
  );
}
