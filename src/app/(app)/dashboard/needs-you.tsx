import Link from "next/link";
import type { Alert } from "@/lib/alerts";
import { StatusDot, cn } from "@/components/ui";
import type { AlertGroup } from "./lib";

const SHOW = 6;

/**
 * What needs a decision, in one short list: critical first, a filter chip per kind, and the full list one click
 * away (/dashboard/alerts). A single calm line when nothing is open. Alerts are already filtered to this role.
 */
export function NeedsAttention({ alerts, groups, className }: { alerts: Alert[]; groups: AlertGroup[]; className?: string }) {
  const critical = alerts.filter((a) => a.level === "critical").length;
  const more = alerts.length - SHOW;
  return (
    <section aria-labelledby="needs-attention" className={cn("flex min-w-0 flex-col rounded-lg border border-line bg-surface shadow-card", className)}>
      <header className="flex min-h-11 items-center justify-between gap-2 px-4 pb-0 pt-3">
        <h2 id="needs-attention" className="flex items-center gap-2 text-[14px] font-semibold text-fg">
          Needs attention
          {alerts.length > 0 && (
            <span className="num text-[12px] font-normal text-fg-subtle">
              {alerts.length}{critical > 0 && <span className="text-danger"> · {critical} critical</span>}
            </span>
          )}
        </h2>
        {alerts.length > 0 && <Link href="/dashboard/alerts" className="text-[12px] font-medium text-fg-muted hover:text-fg">View all →</Link>}
      </header>

      {alerts.length === 0 ? (
        <div className="flex flex-1 items-center gap-3 px-4 py-8">
          <StatusDot tone="ok" />
          <div>
            <p className="text-[13px] font-medium text-fg">All clear</p>
            <p className="text-[12px] text-fg-muted">Nothing needs a decision right now.</p>
          </div>
        </div>
      ) : (
        <>
          <nav aria-label="Filter by kind" className="flex flex-wrap gap-1.5 px-4 pb-1 pt-2">
            {groups.map((g) => (
              <Link key={g.kind} href={`/dashboard/alerts?kind=${g.kind}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-0.5 text-[12px] text-fg-muted transition-colors hover:border-line-strong hover:text-fg">
                {g.label}<span className="num text-fg-subtle">{g.items.length}</span>
              </Link>
            ))}
          </nav>
          <ul className="flex-1 py-1">
            {alerts.slice(0, SHOW).map((a, i) => (
              <li key={`${a.href}-${i}`}>
                <Link href={a.href} className="flex items-start gap-3 px-4 py-2 transition-colors hover:bg-raised">
                  <StatusDot tone={a.level === "critical" ? "danger" : "warn"} className="mt-[5px]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-fg">{a.title}</span>
                    <span className="block truncate text-[12px] text-fg-subtle">{a.detail}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {more > 0 && (
            <Link href="/dashboard/alerts" className="border-t border-line px-4 py-2 text-[12px] text-fg-muted transition-colors hover:bg-raised hover:text-fg">
              <span className="num">{more}</span> more
            </Link>
          )}
        </>
      )}
    </section>
  );
}
