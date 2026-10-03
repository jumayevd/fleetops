import Link from "next/link";
import type { ComponentProps } from "react";
import { Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { fleetSnapshot } from "@/lib/telemetry";
import { getAlerts } from "@/lib/alerts";
import { monthlyFinancials, receivables, revenueMtdComparison, weeklyProduction } from "@/lib/stats";
import { money } from "@/lib/format";
import { Card, LinkButton, PageHeader, Stat, cn } from "@/components/ui";
import { RevenueChart, Spark } from "@/components/charts";
import { LiveFleetMini } from "@/components/live-fleet";
import { NeedsYou } from "./needs-you";
import { BillingQueue, MonthSoFar, MoreLink, RecentActivity, UpcomingPickups, WeekProduction } from "./panels";
import { billingQueue, operationalCounts, overdueInvoices, recentEvents, upcomingPickups } from "./queries";
import { greeting, groupAlerts, longDate, movingTrucks, pct, plural, pts, visibleAlerts } from "./lib";

export const metadata = { title: "Overview" };

/** KPI tile that goes somewhere. */
function Tile({ href, className, ...stat }: ComponentProps<typeof Stat> & { href: string }) {
  return (
    <Link href={href} className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
      <Stat {...stat} className={cn("h-full transition-colors hover:border-line-strong", className)} />
    </Link>
  );
}

export default async function Dashboard() {
  const user = await requireUser("dashboard.view");
  const showMoney = can(user.role, "finance.view");
  const canEdit = can(user.role, "loads.edit");
  const now = new Date();

  const [fleet, rawAlerts, allMonths, ops, upcoming, events, queue, week, rev, ar, overdue] = await Promise.all([
    fleetSnapshot(),
    getAlerts(),
    monthlyFinancials(7),
    operationalCounts(now),
    upcomingPickups(now),
    recentEvents(10),
    billingQueue(),
    weeklyProduction(now),
    showMoney ? revenueMtdComparison() : Promise.resolve(null),
    showMoney ? receivables() : Promise.resolve(null),
    showMoney ? overdueInvoices(now) : Promise.resolve(null),
  ]);

  const alerts = visibleAlerts(rawAlerts, user.role);
  const groups = groupAlerts(alerts);
  const moving = movingTrucks(fleet);

  // Fleet
  const activeTrucks = fleet.filter((t) => t.status === "ACTIVE");
  const busyTrucks = activeTrucks.filter((t) => t.load).length;
  const utilization = activeTrucks.length ? busyTrucks / activeTrucks.length : 0;
  const inShop = fleet.length - activeTrucks.length;
  const runningLate = fleet.filter((t) => t.load?.status === "IN_TRANSIT" && t.load.eta && t.load.eta > t.load.deliveryAt).length;

  // Performance: six months ending at the latest month with deliveries. A new month with nothing
  // delivered yet would otherwise read 0 % and drag every sparkline and the revenue chart to zero.
  const current = allMonths.at(-1)!;
  const months = current.loads ? allMonths.slice(1) : allMonths.slice(0, -1);
  const perf = months.at(-1)!;
  const prev = months.at(-2);
  const perfIsCurrent = perf.month === current.month;
  const onTimeDelta = prev?.loads ? perf.onTimePct - prev.onTimePct : null;
  const emptyDelta = prev?.loads ? perf.emptyPct - prev.emptyPct : null;
  const growth = rev && rev.mtd > 0 && rev.prior > 0 ? Math.round(((rev.mtd - rev.prior) / rev.prior) * 100) : null;
  // Overdue figures come from one query (sent, due date passed) so the tile, the billing queue and /finance?status=overdue agree.
  const overduePct = ar && overdue && ar.total ? Math.round((overdue.amount / ar.total) * 100) : 0;

  const summary = [
    plural(moving, "truck") + " moving",
    `${ops.assigned} awaiting pickup`,
    alerts.length === 0 ? "nothing needs you" : alerts.length === 1 ? "1 thing needs you" : `${alerts.length} things need you`,
  ].join(" · ");

  return (
    <>
      <PageHeader
        eyebrow={`Overview · ${longDate(now)}`}
        title={`${greeting(now)}, ${user.name.split(" ")[0]}`}
        subtitle={summary}
        actions={canEdit && <LinkButton href="/loads/new"><Plus />New load</LinkButton>}
      />

      {/* 1 · Needs you */}
      <NeedsYou groups={groups} />

      {/* 2 · Operations now */}
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <Tile href="/loads?status=IN_TRANSIT" label="In transit" value={ops.inTransit}
          hint={runningLate ? `${plural(runningLate, "load")} running late` : ops.inTransit ? "all on schedule" : "no loads moving"}
          delta={runningLate ? `${runningLate} late` : undefined} deltaTone="danger" />
        <Tile href="/loads?status=ASSIGNED" label="Awaiting pickup" value={ops.assigned}
          hint={`${plural(ops.pickupsSoon, "pickup")} in the next 24 h`} />
        <Tile href={canEdit ? "/dispatch" : "/loads?status=PLANNED"} label="Unassigned · next 24 h" value={ops.unassignedSoon}
          hint={ops.unassignedSoon ? "need a truck before pickup" : `${plural(ops.planned, "booked load")} further out`}
          delta={ops.unassignedSoon ? "needs truck" : undefined} deltaTone="warn" />
        <Tile href="/tracking" label="Fleet utilization" value={`${Math.round(utilization * 100)}%`}
          hint={`${busyTrucks} of ${activeTrucks.length} active trucks on loads${inShop ? ` · ${inShop} in shop` : ""}`} />
        <Tile href="/drivers" label="Drivers ready" value={ops.driversReady}
          hint={`${ops.driversActive - ops.driversReady} working${ops.onLeave ? ` · ${ops.onLeave} on leave` : ""}`}
          delta={ops.hold ? `${ops.hold} on hold` : undefined} deltaTone="warn" />
      </div>

      {/* 3 · Performance */}
      <div className="mt-3 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {showMoney && rev && ar ? (
          <>
            <Tile href="/finance" label="Revenue · month to date" value={money(rev.mtd)}
              delta={growth === null ? undefined : pct(growth)} deltaTone={growth === null ? undefined : growth >= 0 ? "ok" : "danger"}
              hint={rev.mtd === 0
                ? (rev.prior ? `no deliveries yet · ${money(rev.prior)} by this day last month` : "no deliveries yet this month")
                : rev.prior ? `${money(rev.prior)} same days last month` : "no comparable deliveries last month"}
              spark={<Spark data={months.map((m) => m.revenue)} />} />
            <Tile href="/finance?status=overdue" label="Receivables" value={money(ar.total)}
              delta={overdue?.count ? `${overduePct}% overdue` : undefined} deltaTone="danger"
              hint={`${plural(ar.count, "open invoice")}${overdue?.count ? ` · ${money(overdue.amount)} past due` : " · none overdue"}`} />
          </>
        ) : (
          <>
            <Tile href="/loads?status=DELIVERED" label={`Delivered · ${perf.month}`} value={perf.loads}
              hint={prev ? `${prev.loads} in ${prev.month}` : undefined}
              spark={<Spark data={months.map((m) => m.loads)} />} />
            <Tile href="/maintenance" label="Trucks in shop" value={inShop}
              hint={inShop ? "maintenance or out of service" : "every truck available"}
              delta={inShop ? `${Math.round((inShop / Math.max(1, fleet.length)) * 100)}% of fleet` : undefined} deltaTone="warn" />
          </>
        )}
        <Tile href="/reports" label={`On time · ${perf.month}`} value={perf.loads ? `${perf.onTimePct}%` : "—"}
          delta={onTimeDelta === null ? undefined : pts(onTimeDelta)} deltaTone={onTimeDelta === null ? undefined : onTimeDelta > 0 ? "ok" : onTimeDelta < 0 ? "danger" : "neutral"}
          hint={perf.loads ? `${plural(perf.loads, "delivery", "deliveries")} · vs ${prev?.month ?? "last month"}` : "no deliveries yet"}
          spark={<Spark data={months.map((m) => m.onTimePct)} />} />
        <Tile href="/reports" label={`Empty km · ${perf.month}`} value={perf.km + perf.emptyKm ? `${perf.emptyPct}%` : "—"}
          delta={emptyDelta === null ? undefined : pts(emptyDelta)} deltaTone={emptyDelta === null ? undefined : emptyDelta < 0 ? "ok" : emptyDelta > 0 ? "danger" : "neutral"}
          hint={perf.km ? `${Math.round(perf.emptyKm).toLocaleString("en-US")} of ${Math.round(perf.km + perf.emptyKm).toLocaleString("en-US")} km unpaid` : "no distance recorded"}
          spark={<Spark data={months.map((m) => m.emptyPct)} />} />
      </div>

      {/* 4 · Live fleet + queues */}
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card title="Live fleet" className="xl:col-span-2" bodyClassName="p-1.5"
          actions={<MoreLink href="/tracking">Live map</MoreLink>}>
          <LiveFleetMini initial={fleet} />
        </Card>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <Card title="Billing queue" actions={<MoreLink href={showMoney ? "/finance" : "/loads?status=DELIVERED"}>{showMoney ? "Finance" : "Delivered loads"}</MoreLink>} bodyClassName="px-4 py-2.5">
            <BillingQueue queue={queue} overdue={overdue} showMoney={showMoney} />
          </Card>
          <Card title="This week" actions={<MoreLink href="/dispatch/weekly">Weekly board</MoreLink>}>
            <WeekProduction week={week} showMoney={showMoney} />
          </Card>
        </div>
      </div>

      {/* 5 · Upcoming + activity */}
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card title="Upcoming pickups" className="xl:col-span-2" flush
          actions={<><span className="num text-[11px] text-fg-subtle">next 24 h</span><MoreLink href="/dispatch">Dispatch board</MoreLink></>}>
          <UpcomingPickups loads={upcoming} now={now} canEdit={canEdit} />
        </Card>
        <Card title="Recent activity" flush actions={can(user.role, "audit.view") ? <MoreLink href="/admin/audit">Audit log</MoreLink> : <MoreLink href="/loads">Loads</MoreLink>}>
          <RecentActivity events={events} />
        </Card>
      </div>

      {/* 6 · Money */}
      {showMoney && (
        <div className="mt-4 grid gap-4 xl:grid-cols-3">
          <Card title="Revenue vs direct costs" className="xl:col-span-2"
            actions={<><span className="num text-[11px] text-fg-subtle">{months[0].month} – {perf.month} · the gap is gross margin</span><MoreLink href="/reports">Reports</MoreLink></>}>
            <RevenueChart data={months} height={240} />
          </Card>
          <Card title={perfIsCurrent ? `${perf.month} so far` : `${perf.month} · last closed month`} actions={<MoreLink href="/finance">Finance</MoreLink>}>
            <MonthSoFar month={perf} note={perfIsCurrent ? undefined : `Nothing delivered yet in ${current.month}. Figures move here as loads are delivered.`} />
          </Card>
        </div>
      )}
    </>
  );
}
