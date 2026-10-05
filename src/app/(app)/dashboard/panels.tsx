import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, Chip, EmptyState, LinkButton, Progress, StatusDot, Table, cn, type Tone } from "@/components/ui";
import { ago, dateTime, km, money, money2 } from "@/lib/format";
import { LOAD_STATUS_LABELS, humanize, type LoadStatus } from "@/lib/constants";
import type { monthlyFinancials, weeklyProduction } from "@/lib/stats";
import type { billingQueue, RecentEvent, UpcomingPickup } from "./queries";
import { EVENT_TONE, plural, type FleetLegend } from "./lib";

type Weekly = Awaited<ReturnType<typeof weeklyProduction>>;
type Month = Awaited<ReturnType<typeof monthlyFinancials>>[number];
type Billing = Awaited<ReturnType<typeof billingQueue>>;

/** Quiet "see more" link for card headers. */
export function MoreLink({ href, children }: { href: string; children: ReactNode }) {
  return <Link href={href} className="text-[12px] font-medium text-fg-muted hover:text-fg">{children} →</Link>;
}

/* ------------------------------------------------------------------ */
/* Billing queue                                                       */
/* ------------------------------------------------------------------ */

function QueueRow({ href, label, hint, count, sum, tone }: { href: string; label: string; hint: string; count: number; sum?: number; tone: "warn" | "info" | "danger" }) {
  return (
    <Link href={href} className="-mx-2 flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-raised">
      <StatusDot tone={count ? tone : "neutral"} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-fg">{label}</span>
        <span className="block truncate text-[11px] text-fg-subtle">{hint}</span>
      </span>
      <span className="text-right">
        <span className="num block text-[15px] font-semibold leading-none text-fg">{count}</span>
        {sum !== undefined && <span className="num mt-0.5 block text-[11px] text-fg-muted">{money(sum)}</span>}
      </span>
    </Link>
  );
}

export function BillingQueue({ queue, overdue, showMoney }: { queue: Billing; overdue: { count: number; amount: number } | null; showMoney: boolean }) {
  // Finance roles work the queue on /finance (its default tab); everyone else gets the loads list filtered by billing stage.
  return (
    <div className="space-y-0.5">
      <QueueRow href={showMoney ? "/finance" : "/loads?billing=MISSING_DOCS"} label="Missing documents" hint="delivered, waiting on RC or POD" count={queue.missingDocs.count} sum={showMoney ? queue.missingDocs.sum : undefined} tone="warn" />
      <QueueRow href={showMoney ? "/finance" : "/loads?billing=READY_TO_INVOICE"} label="Ready to invoice" hint="paperwork complete, not yet billed" count={queue.ready.count} sum={showMoney ? queue.ready.sum : undefined} tone="info" />
      {overdue && <QueueRow href="/finance?status=overdue" label="Overdue invoices" hint="sent, past due date" count={overdue.count} sum={overdue.amount} tone="danger" />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Fleet snapshot (roles without the live map)                         */
/* ------------------------------------------------------------------ */

const MOTION: { key: "rolling" | "idle" | "stopped" | "inService"; label: string; tone: Tone; faded?: boolean }[] = [
  { key: "rolling", label: "Rolling", tone: "progress" },
  { key: "idle", label: "Idle", tone: "info" },
  { key: "stopped", label: "Stopped", tone: "info", faded: true },
  { key: "inService", label: "In service", tone: "warn" },
];

/** The live map's legend as static numbers, for roles that cannot open /tracking or poll /api/fleet. */
export function FleetSummary({ legend: f }: { legend: FleetLegend }) {
  return (
    <div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        {MOTION.map((m) => (
          <div key={m.key} className="min-w-0">
            <dt className="flex items-center gap-1.5 text-[11px] text-fg-subtle">
              <StatusDot tone={m.tone} className={cn(m.faded && "opacity-50")} />{m.label}
            </dt>
            <dd className="num mt-0.5 text-[15px] font-semibold text-fg">{f[m.key]}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-[12px] text-fg-muted">
        <span className="num">{f.onLoad}</span> of <span className="num">{plural(f.trucks, "truck")}</span> on loads
        {f.late > 0 && <> · <span className="num text-danger">{f.late} running late</span></>}
        {f.noSignal > 0 && <> · <span className="num text-warn">{f.noSignal} no signal</span></>}
      </p>
      <p className="mt-2 text-[11px] text-fg-subtle">Counts as of this page load. The live map is for dispatch and fleet roles; loads in transit show where each delivery stands.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* This week production                                                */
/* ------------------------------------------------------------------ */

export function WeekProduction({ week, showMoney }: { week: Weekly; showMoney: boolean }) {
  const rows = week.groups.flatMap((g) => g.rows);
  const goal = rows.reduce((a, r) => a + r.goal, 0);
  const producing = rows.filter((r) => r.total > 0).length;
  const reach = goal ? week.grand.total / goal : 0;
  const reachPct = Math.round(reach * 100);
  const tone = reach >= 1 ? "ok" : reach >= 0.6 ? "progress" : "warn";
  const cells: [string, ReactNode][] = showMoney
    ? [["Revenue", money(week.grand.total)], ["Distance", km(week.grand.km)], ["Per km", money2(week.grand.rpk)], ["Per driver", money(week.grand.avgPerTruck)]]
    : [["Distance", km(week.grand.km)], ["Loads", String(rows.reduce((a, r) => a + r.days.reduce((b, d) => b + d.loads.length, 0), 0))]];
  return (
    <div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
        {cells.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-[11px] text-fg-subtle">{k}</dt>
            <dd className="num mt-0.5 truncate text-[15px] font-semibold text-fg">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-[11px]">
          <span className="text-fg-subtle">Plan reach · {producing} of {plural(week.grand.drivers, "driver")} producing</span>
          <span className={cn("num font-medium", tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : "text-fg")}>{reachPct}%</span>
        </div>
        <Progress value={reach} tone={tone} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Month so far (finance)                                              */
/* ------------------------------------------------------------------ */

export function MonthSoFar({ month, note }: { month: Month; note?: string }) {
  const marginPct = month.revenue ? month.margin / month.revenue : 0;
  const foot = note ?? (month.loads ? null : "No deliveries recorded. Figures fill in as loads are delivered.");
  const cells: [string, ReactNode][] = [
    ["Loads delivered", String(month.loads)],
    ["Gross margin", month.loads ? money(month.margin) : "—"],
    ["Revenue per km", month.km ? money2(month.revPerKm) : "—"],
    ["On time", month.loads ? `${month.onTimePct}%` : "—"],
  ];
  return (
    <div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        {cells.map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-[11px] text-fg-subtle">{k}</dt>
            <dd className="num mt-0.5 truncate text-[15px] font-semibold text-fg">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between text-[11px]">
          <span className="text-fg-subtle">Margin</span>
          <span className="num font-medium text-fg">{month.loads ? `${Math.round(marginPct * 100)}%` : "—"}</span>
        </div>
        <Progress value={marginPct} tone={marginPct >= 0.25 ? "ok" : marginPct >= 0.12 ? "progress" : "warn"} />
      </div>
      {foot && <p className="mt-3 text-[11px] text-fg-subtle">{foot}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Upcoming pickups                                                    */
/* ------------------------------------------------------------------ */

export function UpcomingPickups({ loads, total, now, canEdit }: { loads: UpcomingPickup[]; total: number; now: Date; canEdit: boolean }) {
  if (loads.length === 0) {
    return (
      <EmptyState
        title="No pickups in the next 24 hours"
        description="Loads with a later pickup sit on the prebook tab until they are inside the 24-hour window."
        action={canEdit ? <LinkButton href="/loads/new" variant="secondary" size="sm">New load</LinkButton> : <LinkButton href="/loads" variant="secondary" size="sm">All loads</LinkButton>}
      />
    );
  }
  const more = total - loads.length;
  return (
    <>
      <Table dense stickyHead={false} head={["Pickup", "Load", "Customer", "Team", "Truck / driver", "Status"]}>
        {loads.map((l) => {
          const late = l.pickupAt < now;
          return (
            <tr key={l.id}>
              <td className="whitespace-nowrap">
                <Link href={`/loads/${l.id}`} className="block">
                  <span className="num block text-fg">{dateTime(l.pickupAt)}</span>
                  <span className={cn("block text-[11px]", late ? "font-medium text-danger" : "text-fg-subtle")}>{late ? `overdue · ${ago(l.pickupAt)}` : ago(l.pickupAt)}</span>
                </Link>
              </td>
              <td className="min-w-0">
                <Link href={`/loads/${l.id}`} className="block min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span className="num font-medium text-fg">{l.reference}</span>
                    {l.priority !== "NORMAL" && l.priority !== "LOW" && <Chip tone={l.priority === "URGENT" ? "danger" : "warn"}>{l.priority}</Chip>}
                    {l.hazmat && <Chip tone="warn">Hazmat</Chip>}
                  </span>
                  <span className="block truncate text-[11px] text-fg-subtle">{l.originCity} → {l.destCity} · {l.commodity}</span>
                </Link>
              </td>
              <td className="max-w-44 truncate text-fg-muted">{l.customer.name}</td>
              <td className="whitespace-nowrap text-fg-muted">
                {l.team ? (
                  <span className="inline-flex items-center gap-1.5">
                    {l.team.color && <span className="h-1.5 w-1.5 rounded-full" style={{ background: l.team.color }} aria-hidden />}
                    {l.team.name}
                  </span>
                ) : <span className="text-fg-faint">—</span>}
              </td>
              <td className="whitespace-nowrap">
                {l.truck ? (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="num text-fg">{l.truck.unitNumber}</span>
                    <span className="text-fg-muted">{l.driver?.name ?? "no driver"}</span>
                    {l.driver?.hold && <Chip tone="warn">Hold</Chip>}
                  </span>
                ) : (
                  <Link href={canEdit ? `/loads/${l.id}/edit` : `/loads/${l.id}`} className="inline-flex"><Chip tone="warn">Needs truck</Chip></Link>
                )}
              </td>
              <td><Badge value={l.status} label={LOAD_STATUS_LABELS[l.status as LoadStatus]} /></td>
            </tr>
          );
        })}
      </Table>
      {more > 0 && (
        <Link href="/dispatch" className="block border-t border-line px-3 py-1.5 text-[11px] text-fg-muted transition-colors hover:bg-raised hover:text-fg">
          +<span className="num">{plural(more, "more pickup")}</span> · Dispatch board →
        </Link>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Recent activity                                                     */
/* ------------------------------------------------------------------ */

export function RecentActivity({ events }: { events: RecentEvent[] }) {
  if (events.length === 0) return <EmptyState title="No activity yet" description="Load events appear here as dispatchers and drivers update loads." />;
  return (
    <ul className="divide-y divide-line">
      {events.map((e) => (
        <li key={e.id} className="flex items-start gap-3 px-4 py-2">
          <Badge value={e.type} tone={EVENT_TONE[e.type] ?? "neutral"} label={humanize(e.type)} className="mt-px w-[84px] justify-center" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] text-fg" title={e.message}>
              <Link href={`/loads/${e.load.id}`} className="num font-medium hover:text-accent-text">{e.load.reference}</Link>
              <span className="text-fg-muted"> · {e.message}</span>
            </p>
            <p className="text-[11px] text-fg-subtle">{e.user?.name ?? "System"} · {ago(e.createdAt)}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
