import { cookies } from "next/headers";
import { Banknote, Clock3, Gauge, PackageOpen, Plus, Route, UserCheck, Wrench } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { fleetSnapshot } from "@/lib/telemetry";
import { getAlerts } from "@/lib/alerts";
import { monthlyFinancials, receivables, revenueMtdComparison, weeklyProduction } from "@/lib/stats";
import { money, money2 } from "@/lib/format";
import { Card, EmptyState, LinkButton, PageHeader, cn } from "@/components/ui";
import { RevenueChart, SimpleBar } from "@/components/charts-lazy";
import { LiveFleetMini } from "@/components/live-fleet";
import { NeedsAttention } from "./needs-you";
import { TabbedCard } from "./today-tabs";
import { CustomizeOverview } from "./customize";
import { OVERVIEW_COOKIE, parseHidden, type OverviewSection } from "./sections";
import { BillingQueue, Flag, FleetSummary, KpiStrip, MetricList, MoreLink, RecentActivity, UpcomingPickups, WeekProduction, type Kpi, type Metric } from "./panels";
import { billingQueue, operationalCounts, overdueInvoices, recentEvents, upcomingPickups } from "./queries";
import { canOpen, fleetLegend, greeting, groupAlerts, isRunningLate, longDate, movingTrucks, pct, plural, pts, visibleAlerts } from "./lib";

export const metadata = { title: "Overview" };

/** Sign-aware tone for a delta where up is good (or, with `lowerIsBetter`, where down is good). */
const trend = (d: number | null, lowerIsBetter = false) =>
  d === null || d === 0 ? undefined : (d > 0) !== lowerIsBetter ? ("ok" as const) : ("danger" as const);

const none = Promise.resolve(null);

/**
 * Overview, top to bottom: the day in six numbers; today's pickups and activity next to what needs attention;
 * the live fleet with billing and the week's production; then the month's performance. Each person can hide
 * sections (Customize, saved in a cookie); hidden sections are not queried at all. Every figure links to the
 * page that owns it, and only where this role can open it.
 */
export default async function Dashboard() {
  const user = await requireUser("dashboard.view");
  const hidden = parseHidden((await cookies()).get(OVERVIEW_COOKIE)?.value);
  const show = (s: OverviewSection) => !hidden.has(s);
  const showMoney = can(user.role, "finance.view");
  const canEdit = can(user.role, "loads.edit");
  const seesTracking = can(user.role, "tracking.view");
  const now = new Date();
  // Links only go where this role can go; requireUser would bounce anything else straight back here.
  const to = (href: string) => (canOpen(user.role, href) ? href : undefined);

  const needFleet = show("numbers") || show("fleet");
  const [fleet, rawAlerts, allMonths, ops, upcoming, events, queue, week, rev, ar, overdue] = await Promise.all([
    needFleet ? fleetSnapshot() : none,
    getAlerts(), // shared with the alert bell in the same request (cached), and feeds the summary line
    show("performance") ? monthlyFinancials(7) : none,
    show("numbers") ? operationalCounts(now) : none,
    show("today") ? upcomingPickups(now, 7) : none,
    show("today") ? recentEvents(8) : none,
    show("billing") ? billingQueue() : none,
    show("week") ? weeklyProduction(now) : none,
    showMoney && show("numbers") ? revenueMtdComparison() : none,
    showMoney && show("performance") ? receivables() : none,
    showMoney && (show("billing") || show("performance")) ? overdueInvoices(now) : none,
  ]);

  const alerts = visibleAlerts(rawAlerts, user.role);
  const firstName = user.name.split(" ")[0];
  const summary = [
    longDate(now),
    fleet ? `${plural(movingTrucks(fleet), "truck")} moving` : null,
    alerts.length ? `${alerts.length} to review` : "all clear",
  ].filter(Boolean).join(" · ");

  /* ---------- Key numbers ---------- */
  let kpis: Kpi[] = [];
  if (fleet && ops) {
    const activeTrucks = fleet.filter((t) => t.status === "ACTIVE");
    const busyTrucks = activeTrucks.filter((t) => t.load).length;
    const utilization = activeTrucks.length ? busyTrucks / activeTrucks.length : 0;
    const inShop = fleet.length - activeTrucks.length;
    const runningLate = fleet.filter((t) => isRunningLate(t.load)).length;
    const growth = rev && rev.mtd > 0 && rev.prior > 0 ? Math.round(((rev.mtd - rev.prior) / rev.prior) * 100) : null;
    // One calm accent for every icon tile; only an exception switches its tile to the warning colour.
    kpis = [
      {
        label: "In transit", value: ops.inTransit, href: to("/loads?status=IN_TRANSIT"), icon: Route, tone: runningLate ? "danger" : "accent",
        sub: runningLate ? <Flag tone="danger">{plural(runningLate, "load")} running late</Flag> : ops.inTransit ? "All on schedule" : "Nothing on the road",
      },
      { label: "Awaiting pickup", value: ops.assigned, href: to("/loads?status=ASSIGNED"), icon: Clock3, tone: "accent", sub: `${ops.pickupsSoon} in the next 24 h` },
      {
        label: "Needs a truck", value: ops.unassignedSoon, href: to(canEdit ? "/dispatch" : "/loads?status=PLANNED"), icon: PackageOpen, tone: ops.unassignedSoon ? "warn" : "accent",
        sub: ops.unassignedSoon ? <Flag tone="warn">Pickup within 24 h</Flag> : `${plural(ops.planned, "booked load")} later`,
      },
      { label: "Fleet utilization", value: `${Math.round(utilization * 100)}%`, href: to("/tracking"), icon: Gauge, tone: "accent", sub: `${busyTrucks} of ${activeTrucks.length} trucks on loads` },
      {
        label: "Drivers ready", value: ops.driversReady, href: to("/drivers"), icon: UserCheck, tone: "accent",
        sub: ops.hold ? <><Flag tone="warn">{ops.hold} on hold</Flag> · {ops.driversWorking} working</> : `${ops.driversWorking} working`,
      },
      rev
        ? {
            label: "Revenue this month", value: money(rev.mtd), href: to("/finance"), icon: Banknote, tone: "accent",
            sub: growth === null
              ? (rev.prior ? `${money(rev.prior)} by now last month` : "No deliveries yet")
              : <><Flag tone={trend(growth)}>{pct(growth)}</Flag> vs last month</>,
          }
        : {
            label: "Trucks in shop", value: inShop, href: to("/maintenance"), icon: Wrench, tone: inShop ? "warn" : "accent",
            sub: inShop ? `${Math.round((inShop / Math.max(1, fleet.length)) * 100)}% of the fleet` : "Every truck available",
          },
    ];
  }

  /* ---------- Performance ---------- */
  let performance: React.ReactNode = null;
  if (allMonths) {
    // Six months ending at the latest month with deliveries. A new month with nothing delivered yet would
    // otherwise read 0 % and drag the chart and the deltas to zero.
    const current = allMonths.at(-1)!;
    const months = current.loads ? allMonths.slice(1) : allMonths.slice(0, -1);
    const perf = months.at(-1)!;
    const prev = months.at(-2);
    const onTimeDelta = prev?.loads ? perf.onTimePct - prev.onTimePct : null;
    const emptyDelta = prev?.loads ? perf.emptyPct - prev.emptyPct : null;
    // Overdue figures come from one query (sent, due date passed) so this card, the billing queue and /finance?status=overdue agree.
    const overduePct = ar && overdue && ar.total ? Math.round((overdue.amount / ar.total) * 100) : 0;
    const marginPct = perf.revenue ? Math.round((perf.margin / perf.revenue) * 100) : 0;
    const delivered: Metric = { label: `Loads delivered · ${perf.month}`, value: perf.loads, note: prev ? `${prev.loads} in ${prev.month}` : undefined, href: to("/loads?status=DELIVERED") };
    const onTime: Metric = {
      label: `On time · ${perf.month}`, value: perf.loads ? `${perf.onTimePct}%` : "—", href: to("/reports"),
      note: onTimeDelta === null ? undefined : pts(onTimeDelta), noteTone: trend(onTimeDelta),
    };
    const emptyKm: Metric = {
      label: `Empty km · ${perf.month}`, value: perf.km + perf.emptyKm ? `${perf.emptyPct}%` : "—", href: to("/reports"),
      note: emptyDelta === null ? undefined : pts(emptyDelta), noteTone: trend(emptyDelta, true),
    };
    const metrics: Metric[] = showMoney && ar
      ? [
          {
            label: "Receivables", value: money(ar.total), href: to("/finance?status=overdue"),
            note: overdue?.count ? `${overduePct}% overdue` : "none overdue", noteTone: overdue?.count ? "danger" : undefined,
          },
          { label: `Gross margin · ${perf.month}`, value: perf.loads ? money(perf.margin) : "—", note: perf.loads ? `${marginPct}%` : undefined },
          { label: `Revenue per km · ${perf.month}`, value: perf.km ? money2(perf.revPerKm) : "—" },
          onTime, emptyKm, delivered,
        ]
      : [delivered, onTime, emptyKm];
    performance = (
      <Card title="Performance" bodyClassName="grid gap-6 px-4 pb-4 pt-2 lg:grid-cols-3"
        actions={<><span className="hidden text-[12px] text-fg-subtle sm:inline">{months[0].month} – {perf.month}</span><MoreLink href="/reports">Reports</MoreLink></>}>
        <div className="min-w-0 lg:col-span-2">
          <p className="mb-2 text-[12px] text-fg-muted">{showMoney ? "Revenue and direct costs by month · the gap is gross margin" : "Loads delivered by month"}</p>
          {showMoney
            ? <RevenueChart data={months} height={220} />
            : <SimpleBar data={months.map((m) => ({ month: m.month, loads: m.loads }))} dataKey="loads" nameKey="month" tone="accent" height={220} format="number" />}
        </div>
        <MetricList items={metrics} className="self-start" />
      </Card>
    );
  }

  /* ---------- Cards ---------- */
  const today = upcoming && events && (
    <TabbedCard label="Today" className={show("attention") ? "xl:col-span-2" : undefined} tabs={[
      {
        key: "pickups", label: "Pickups", hint: "next 24 h", count: upcoming.total,
        more: { href: "/dispatch", label: "Dispatch board" },
        content: <UpcomingPickups loads={upcoming.loads} total={upcoming.total} now={now} canEdit={canEdit} />,
      },
      {
        key: "activity", label: "Recent activity",
        more: can(user.role, "audit.view") ? { href: "/admin/audit", label: "Audit log" } : { href: "/loads", label: "Loads" },
        content: <RecentActivity events={events} />,
      },
    ]} />
  );
  const attention = show("attention") && <NeedsAttention alerts={alerts} groups={groupAlerts(alerts)} />;
  const billing = queue && (
    <Card title="Billing" flush actions={<MoreLink href={showMoney ? "/finance" : "/loads?billing=MISSING_DOCS"}>{showMoney ? "Finance" : "Loads"}</MoreLink>}>
      <BillingQueue queue={queue} overdue={overdue} showMoney={showMoney} />
    </Card>
  );
  const thisWeek = week && (
    <Card title="This week" actions={<MoreLink href="/dispatch/weekly">Weekly board</MoreLink>}>
      <WeekProduction week={week} showMoney={showMoney} />
    </Card>
  );
  const side = [billing, thisWeek].filter(Boolean);
  const map = show("fleet") && fleet && seesTracking && (
    <Card title="Live fleet" className={side.length ? "xl:col-span-2" : undefined} bodyClassName="p-1.5 pt-1" actions={<MoreLink href="/tracking">Live map</MoreLink>}>
      <LiveFleetMini initial={fleet} height={side.length ? (showMoney ? 340 : 280) : 380} />
    </Card>
  );
  // The mini map polls /api/fleet, which needs tracking.view: other roles get the same counts as a page-load snapshot.
  const fleetCounts = show("fleet") && fleet && !seesTracking && (
    <Card title="Fleet" actions={<MoreLink href="/loads?status=IN_TRANSIT">Loads in transit</MoreLink>}>
      <FleetSummary legend={fleetLegend(fleet, now.getTime())} />
    </Card>
  );
  const nothing = [kpis.length, today, attention, map, fleetCounts, billing, thisWeek, performance].every((x) => !x);

  return (
    <>
      <PageHeader
        title={`${greeting(now)}, ${firstName}`}
        subtitle={summary}
        actions={<><CustomizeOverview hidden={[...hidden]} />{canEdit && <LinkButton href="/loads/new"><Plus />New load</LinkButton>}</>}
      />

      <div className="space-y-4">
        {kpis.length > 0 && <KpiStrip items={kpis} />}

        {(today || attention) && (
          <div className={cn("grid gap-4", today && attention && "xl:grid-cols-3")}>{today}{attention}</div>
        )}

        {map ? (
          <div className={cn("grid gap-4", side.length && "xl:grid-cols-3")}>
            {map}
            {side.length > 0 && <div className="grid content-start gap-4 sm:grid-cols-2 xl:grid-cols-1">{billing}{thisWeek}</div>}
          </div>
        ) : (fleetCounts || side.length > 0) && (
          // Three cards share a row on wide screens; one or two take half the width each instead of a narrow third.
          <div className={cn("grid gap-4 md:grid-cols-2", [fleetCounts, billing, thisWeek].filter(Boolean).length > 2 && "xl:grid-cols-3")}>{fleetCounts}{billing}{thisWeek}</div>
        )}

        {performance}

        {nothing && (
          <Card>
            <EmptyState title="Your overview is empty" description="Every section is hidden. Use Customize to bring back the ones you want." />
          </Card>
        )}
      </div>
    </>
  );
}
