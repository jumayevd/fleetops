import Link from "next/link";
import { Package, Truck, Users, DollarSign, AlertTriangle, TrendingUp, Plus, Clock } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { fleetSnapshot } from "@/lib/telemetry";
import { getAlerts } from "@/lib/alerts";
import { monthlyFinancials, receivables, revenueMtdComparison } from "@/lib/stats";
import { money, dateTime, ago } from "@/lib/format";
import { Card, Stat, PageHeader, Badge, LinkButton, Progress } from "@/components/ui";
import { RevenueChart } from "@/components/charts";
import { LiveFleetMini } from "@/components/live-fleet";

export const metadata = { title: "Dashboard" };

export default async function Dashboard() {
  const user = await requireUser("dashboard.view");
  const showMoney = can(user.role, "finance.view");

  const [fleet, alerts, months, ar, loadCounts, drivers, upcoming, events, rev] = await Promise.all([
    fleetSnapshot(),
    getAlerts(),
    monthlyFinancials(6),
    receivables(),
    db.load.groupBy({ by: ["status"], _count: true }),
    db.driver.groupBy({ by: ["status"], _count: true }),
    db.load.findMany({
      where: { status: { in: ["PLANNED", "ASSIGNED"] } },
      orderBy: { pickupAt: "asc" }, take: 7,
      include: { customer: { select: { name: true } }, truck: { select: { unitNumber: true } }, driver: { select: { name: true } } },
    }),
    db.loadEvent.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { load: { select: { reference: true, id: true } }, user: { select: { name: true } } } }),
    revenueMtdComparison(),
  ]);

  const count = (s: string) => loadCounts.find((c) => c.status === s)?._count ?? 0;
  const dcount = (s: string) => drivers.find((c) => c.status === s)?._count ?? 0;
  const activeTrucks = fleet.filter((t) => t.status === "ACTIVE").length;
  const busyTrucks = fleet.filter((t) => t.load).length;
  const utilization = activeTrucks ? busyTrucks / activeTrucks : 0;
  const thisMonth = months.at(-1)!;
  const growth = rev.prior ? (rev.mtd - rev.prior) / rev.prior : null;

  return (
    <>
      <PageHeader
        title={`Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}, ${user.name.split(" ")[0]}`}
        subtitle="Here's what's moving across your operation right now."
        actions={can(user.role, "loads.edit") && <LinkButton href="/loads/new"><Plus className="h-4 w-4" />New load</LinkButton>}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-6">
        <Stat label="In transit" value={count("IN_TRANSIT")} hint={`${count("ASSIGNED")} awaiting pickup`} tone="violet" icon={<Truck className="h-4 w-4" />} />
        <Stat label="Unassigned" value={count("PLANNED")} hint="loads need a truck" tone={count("PLANNED") ? "amber" : "green"} icon={<Package className="h-4 w-4" />} />
        <Stat label="Fleet utilization" value={`${Math.round(utilization * 100)}%`} hint={`${busyTrucks}/${activeTrucks} active trucks on loads`} tone="blue" icon={<TrendingUp className="h-4 w-4" />} />
        <Stat label="Drivers available" value={dcount("AVAILABLE")} hint={`${dcount("DRIVING")} driving · ${dcount("ON_LEAVE") + dcount("OFF_DUTY")} off`} tone="green" icon={<Users className="h-4 w-4" />} />
        {showMoney ? (
          <>
            <Stat label="Revenue (month to date)" value={money(rev.mtd)} hint={growth === null ? "no deliveries yet at this point last month" : `${growth >= 0 ? "▲" : "▼"} ${Math.abs(Math.round(growth * 100))}% vs same days last month`} tone="green" icon={<DollarSign className="h-4 w-4" />} />
            <Stat label="Receivables" value={money(ar.total)} hint={`${money(ar.overdue)} overdue`} tone={ar.overdue ? "red" : "slate"} icon={<DollarSign className="h-4 w-4" />} />
          </>
        ) : (
          <>
            <Stat label="Delivered (month)" value={thisMonth.loads} hint={`${thisMonth.onTimePct}% on time`} tone="green" icon={<Package className="h-4 w-4" />} />
            <Stat label="Alerts" value={alerts.length} hint="need attention" tone={alerts.length ? "red" : "slate"} icon={<AlertTriangle className="h-4 w-4" />} />
          </>
        )}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card title="Live fleet" className="xl:col-span-2" bodyClassName="p-2"
          actions={<Link href="/tracking" className="text-xs font-medium text-blue-600 hover:underline">Open control tower →</Link>}>
          <LiveFleetMini initial={fleet} />
        </Card>
        <Card title={`Needs attention (${alerts.length})`} bodyClassName="p-0">
          <ul className="max-h-[392px] divide-y divide-slate-100 overflow-y-auto">
            {alerts.length === 0 && <li className="p-6 text-center text-sm text-slate-500">All clear 🎉</li>}
            {alerts.map((a, i) => (
              <li key={i}>
                <Link href={a.href} className="flex items-start gap-3 px-5 py-3 hover:bg-slate-50">
                  <AlertTriangle className={a.level === "critical" ? "mt-0.5 h-4 w-4 shrink-0 text-rose-500" : "mt-0.5 h-4 w-4 shrink-0 text-amber-500"} />
                  <span>
                    <span className="block text-sm font-medium text-slate-800">{a.title}</span>
                    <span className="block text-xs text-slate-500">{a.detail}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card title="Upcoming pickups" className="xl:col-span-2" bodyClassName="p-0"
          actions={<Link href="/loads?view=board" className="text-xs font-medium text-blue-600 hover:underline">Dispatch board →</Link>}>
          <ul className="divide-y divide-slate-100">
            {upcoming.map((l) => (
              <li key={l.id}>
                <Link href={`/loads/${l.id}`} className="grid grid-cols-[1fr_auto] items-center gap-2 px-5 py-3 hover:bg-slate-50 sm:grid-cols-[110px_1fr_160px_auto]">
                  <span className="font-semibold text-slate-900">{l.reference}</span>
                  <span className="hidden text-sm sm:block">
                    {l.originCity} → {l.destCity}
                    <span className="block text-xs text-slate-500">{l.customer.name} · {l.commodity}</span>
                  </span>
                  <span className="hidden text-xs text-slate-600 sm:flex sm:items-center sm:gap-1"><Clock className="h-3 w-3" />{dateTime(l.pickupAt)}</span>
                  <span className="flex items-center gap-2 justify-self-end">
                    {l.priority !== "NORMAL" && <Badge value={l.priority} />}
                    {l.truck ? <span className="text-xs text-slate-500">{l.truck.unitNumber} · {l.driver?.name.split(" ")[0]}</span> : <Badge value="PLANNED" label="Unassigned" />}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Recent activity" bodyClassName="p-0">
          <ul className="divide-y divide-slate-100">
            {events.map((e) => (
              <li key={e.id} className="px-5 py-3">
                <p className="text-sm text-slate-800">
                  <Link href={`/loads/${e.load.id}`} className="font-medium text-blue-700 hover:underline">{e.load.reference}</Link>{" "}{e.message}
                </p>
                <p className="text-xs text-slate-500">{e.user?.name ?? "System"} · {ago(e.createdAt)}</p>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {showMoney && (
        <div className="mt-6 grid gap-6 xl:grid-cols-3">
          <Card title="Revenue vs. direct costs — last 6 months" className="xl:col-span-2">
            <RevenueChart data={months} />
          </Card>
          <Card title="This month">
            <div className="space-y-4">
              {[
                ["Loads delivered", String(thisMonth.loads)],
                ["Gross margin", money(thisMonth.margin)],
                ["Revenue / km", `$${thisMonth.revPerKm.toFixed(2)}`],
                ["On-time delivery", `${thisMonth.onTimePct}%`],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between border-b border-slate-100 pb-3 text-sm last:border-0">
                  <span className="text-slate-500">{k}</span><span className="font-semibold">{v}</span>
                </div>
              ))}
              <div>
                <p className="mb-1 text-xs text-slate-500">Margin %</p>
                <Progress value={thisMonth.revenue ? thisMonth.margin / thisMonth.revenue : 0} />
              </div>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
