"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { cn, inputClass } from "@/components/ui";

export type FilterSelect = { name: string; placeholder: string; options: { value: string; label: string }[] };

/**
 * Search box + compact selects that live in the URL (?q=…&ownership=…). Server filters, this only
 * rewrites the query string. Search is debounced; selects apply immediately.
 */
export function ListFilters({ basePath, params, selects = [], placeholder = "Search…", className }: {
  basePath: string;
  /** Current query params (undefined = not set). Unknown keys are preserved. */
  params: Record<string, string | undefined>;
  selects?: FilterSelect[];
  placeholder?: string;
  className?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(params.q ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const go = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...params, ...patch })) if (v) p.set(k, v);
    const s = p.toString();
    start(() => router.replace(`${basePath}${s ? `?${s}` : ""}`));
  };
  const onSearch = (v: string) => {
    setQ(v);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => go({ q: v.trim() || undefined }), 300);
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-2", pending && "opacity-70", className)} aria-busy={pending || undefined}>
      <label className="relative block">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-fg-subtle" />
        <input value={q} onChange={(e) => onSearch(e.target.value)} placeholder={placeholder} aria-label={placeholder}
          onKeyDown={(e) => { if (e.key === "Enter") { if (timer.current) clearTimeout(timer.current); go({ q: q.trim() || undefined }); } }}
          className={cn(inputClass, "h-7 w-56 pl-7 pr-7 text-[12px]")} />
        {q && (
          <button type="button" aria-label="Clear search" onClick={() => onSearch("")}
            className="absolute right-1 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-fg-subtle hover:bg-raised hover:text-fg">
            <X className="h-3 w-3" />
          </button>
        )}
      </label>
      {selects.map((s) => (
        <select key={s.name} value={params[s.name] ?? ""} onChange={(e) => go({ [s.name]: e.target.value || undefined })} aria-label={s.placeholder}
          className={cn(inputClass, "h-7 w-auto min-w-28 pr-7 text-[12px]", !params[s.name] && "text-fg-muted")}>
          <option value="">{s.placeholder}</option>
          {s.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      ))}
    </div>
  );
}
