"use client";

import Link from "next/link";
import { useId, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/components/ui";

export type CardTab = { key: string; label: string; hint?: string; count?: number; more?: { href: string; label: string }; content: ReactNode };

/**
 * One card, one list at a time (pickups, activity). The panels are rendered on the server; switching tabs only
 * changes which one is shown, so nothing refetches. Arrow keys move between tabs.
 */
export function TabbedCard({ tabs, label, className }: { tabs: CardTab[]; label: string; className?: string }) {
  const [active, setActive] = useState(tabs[0]?.key);
  const id = useId();
  const current = tabs.find((t) => t.key === active) ?? tabs[0];
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
    setActive(next.key);
    document.getElementById(`${id}-tab-${next.key}`)?.focus();
  };
  if (!current) return null;
  return (
    <section className={cn("flex min-w-0 flex-col rounded-lg border border-line bg-surface", className)}>
      <header className="flex min-h-10 items-center justify-between gap-2 border-b border-line pl-2 pr-4">
        <div role="tablist" aria-label={label} className="flex min-w-0 items-center">
          {tabs.map((t, i) => {
            const on = t.key === current.key;
            return (
              <button key={t.key} id={`${id}-tab-${t.key}`} type="button" role="tab" aria-selected={on} aria-controls={`${id}-panel-${t.key}`}
                tabIndex={on ? 0 : -1} onClick={() => setActive(t.key)} onKeyDown={(e) => onKey(e, i)}
                className={cn("-mb-px flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-2 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40",
                  on ? "border-fg text-fg" : "border-transparent text-fg-muted hover:text-fg")}>
                {t.label}
                {t.hint && <span className="hidden font-normal text-fg-subtle sm:inline">· {t.hint}</span>}
                {t.count != null && <span className="num text-[12px] font-normal text-fg-subtle">{t.count}</span>}
              </button>
            );
          })}
        </div>
        {current.more && (
          <Link href={current.more.href} className="whitespace-nowrap text-[12px] font-medium text-fg-muted hover:text-fg">{current.more.label} →</Link>
        )}
      </header>
      {tabs.map((t) => (
        <div key={t.key} id={`${id}-panel-${t.key}`} role="tabpanel" aria-labelledby={`${id}-tab-${t.key}`} hidden={t.key !== current.key} className="min-w-0 flex-1">
          {t.content}
        </div>
      ))}
    </section>
  );
}
