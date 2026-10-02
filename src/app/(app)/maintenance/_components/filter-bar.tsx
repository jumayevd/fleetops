"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select } from "@/components/ui";

export type FilterDef = {
  name: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  placeholder?: string;
};

/** URL-bound select filters: changing one updates the query string in place (no submit button). */
export function FilterBar({ filters, keep = [] }: {
  filters: FilterDef[];
  /** Query keys to preserve when clearing (tab, period). */
  keep?: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const set = (name: string, value: string) => {
    const p = new URLSearchParams(sp.toString());
    if (value) p.set(name, value); else p.delete(name);
    const q = p.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  };
  const clearHref = () => {
    const p = new URLSearchParams();
    for (const k of keep) { const v = sp.get(k); if (v) p.set(k, v); }
    const q = p.toString();
    return q ? `${pathname}?${q}` : pathname;
  };
  const active = filters.some((f) => f.value);

  return (
    <div className="flex flex-wrap items-end gap-2">
      {filters.map((f) => (
        <label key={f.name} className="block w-44">
          <span className="mb-1 block text-[11px] font-medium text-fg-subtle">{f.label}</span>
          <Select name={f.name} value={f.value} onChange={(e) => set(f.name, e.target.value)} options={f.options} placeholder={f.placeholder ?? "All"} className="h-7 text-[12px]" />
        </label>
      ))}
      {active && (
        <Link href={clearHref()} className="inline-flex h-7 items-center rounded-md px-2 text-[12px] font-medium text-fg-muted hover:bg-raised hover:text-fg">
          Clear filters
        </Link>
      )}
    </div>
  );
}
