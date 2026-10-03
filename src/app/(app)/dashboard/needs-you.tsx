import Link from "next/link";
import { StatusDot, cn } from "@/components/ui";
import type { AlertGroup } from "./lib";
import { MoreLink } from "./panels";

const SHOW = 3;

/** Insight strip: one card per alert kind, worst first. Quiet single card when nothing needs a decision. */
export function NeedsYou({ groups }: { groups: AlertGroup[] }) {
  if (groups.length === 0) {
    return (
      <section className="flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3">
        <StatusDot tone="ok" />
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-fg">All clear</p>
          <p className="text-[12px] text-fg-muted">Nothing needs a decision right now. Compliance, dispatch, fleet, money and safety exceptions appear here as they happen.</p>
        </div>
      </section>
    );
  }
  const total = groups.reduce((a, g) => a + g.items.length, 0);
  const critical = groups.reduce((a, g) => a + g.critical, 0);
  return (
    <section aria-label="Needs you">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="eyebrow">
          Needs you <span className="num">· {total} open{critical ? ` · ${critical} critical` : ""}</span>
        </p>
        <MoreLink href="/dashboard/alerts">All exceptions</MoreLink>
      </div>
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(230px,1fr))]">
        {groups.slice(0, 5).map((g) => <GroupCard key={g.kind} group={g} />)}
      </div>
    </section>
  );
}

function GroupCard({ group: g }: { group: AlertGroup }) {
  const all = `/dashboard/alerts?kind=${g.kind}`;
  const more = g.items.length - SHOW;
  return (
    <section className="flex min-w-0 flex-col rounded-lg border border-line bg-surface">
      <header className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <Link href={all} className="flex min-w-0 items-center gap-2 text-[12px] font-medium text-fg hover:text-accent-text">
          <StatusDot tone={g.tone} />
          <span className="truncate">{g.label}</span>
        </Link>
        <span className="flex items-baseline gap-1.5 whitespace-nowrap">
          {g.critical > 0 && <span className="num text-[11px] text-danger">{g.critical} critical</span>}
          <span className={cn("num text-[15px] font-semibold leading-none", g.critical ? "text-danger" : "text-warn")}>{g.items.length}</span>
        </span>
      </header>
      <ul className="flex-1 divide-y divide-line">
        {g.items.slice(0, SHOW).map((a, i) => (
          <li key={`${a.href}-${i}`}>
            <Link href={a.href} className="block px-3 py-1.5 transition-colors hover:bg-raised">
              <span className="block truncate text-[12px] text-fg">{a.title}</span>
              <span className="block truncate text-[11px] text-fg-subtle">{a.detail}</span>
            </Link>
          </li>
        ))}
      </ul>
      {more > 0 && (
        <Link href={all} className="border-t border-line px-3 py-1.5 text-[11px] text-fg-muted transition-colors hover:bg-raised hover:text-fg">
          +{more} more
        </Link>
      )}
    </section>
  );
}
