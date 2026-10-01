import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { monthlyFinancials } from "@/lib/stats";
import { money, km, daysAgo } from "@/lib/format";
import { Card, PageHeader, Stat, Table } from "@/components/ui";
import { RevenueChart, SimpleBar, TrendLine, Donut } from "@/components/charts";
import { EQUIPMENT_LABELS } from "@/lib/constants";

export const metadata = { title: "Reports" };

export default async function ReportsPage() {
  await requireUser("reports.view");
  const since = daysAgo(180);
  const [months, loads, trucks, drivers, customers] = await Promise.all([
    monthlyFinancials(6),
    db.load.findMany({ where: { status: { in: ["DELIVERED", "INVOICED"] }, deliveredAt: { gte: since } } }),
    db.truck.findMany({ select: { id: true, unitNumber: true, make: true } }),
    db.driver.findMany({ select: { id: true, name: true } }),
    db.customer.findMany({ select: { id: true, name: true } }),
  ]);

  const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);
  const revenue = sum(loads, (l) => l.rate);
  const cost = sum(loads, (l) => l.driverPay + l.fuelCost + l.otherCost);
  const distance = sum(loads, (l) => l.distanceKm);
  const onTime = loads.filter((l) => l.deliveredAt! <= l.deliveryAt).length;

  const group = <K extends string>(key: (l: (typeof loads)[number]) => K | null) => {
    const m = new Map<K, typeof loads>();
    for (const l of loads) { const k = key(l); if (k) m.set(k, [...(m.get(k) ?? []), l]); }
    return m;
  };

  const byCustomer = [...group((l) => l.customerId)].map(([id, ls]) => ({
    name: customers.find((c) => c.id === id)?.name ?? "?", revenue: Math.round(sum(ls, (l) => l.rate)),
  })).sort((a, b) => b.revenue - a.revenue).slice(0, 8);

  const lanes = [...group((l) => `${l.originCity} → ${l.destCity}`)].map(([lane, ls]) => {
    const r = sum(ls, (l) => l.rate), c = sum(ls, (l) => l.driverPay + l.fuelCost + l.otherCost), d = sum(ls, (l) => l.distanceKm);
    return { lane, loads: ls.length, revenue: r, margin: r - c, marginPct: r ? (r - c) / r : 0, perKm: d ? r / d : 0 };
  }).sort((a, b) => b.revenue - a.revenue);

  const truckPerf = [...group((l) => l.truckId)].map(([id, ls]) => {
    const t = trucks.find((x) => x.id === id);
    const r = sum(ls, (l) => l.rate), d = sum(ls, (l) => l.distanceKm);
    return { id, unit: t ? `${t.unitNumber} (${t.make})` : "?", loads: ls.length, revenue: r, km: d, perKm: d ? r / d : 0 };
  }).sort((a, b) => b.revenue - a.revenue);

  const driverPerf = [...group((l) => l.driverId)].map(([id, ls]) => ({
    id, name: drivers.find((d) => d.id === id)?.name ?? "?", loads: ls.length, km: sum(ls, (l) => l.distanceKm),
    onTime: ls.filter((l) => l.deliveredAt! <= l.deliveryAt).length / ls.length, pay: sum(ls, (l) => l.driverPay),
  })).sort((a, b) => b.km - a.km);

  const byEquipment = [...group((l) => l.equipment)].map(([e, ls]) => ({ name: EQUIPMENT_LABELS[e] ?? e, value: ls.length }));

  return (
    <>
      <PageHeader title="Reports" subtitle="Last 6 months of completed loads." />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Revenue" value={money(revenue)} tone="green" />
        <Stat label="Gross margin" value={money(revenue - cost)} hint={`${revenue ? Math.round(((revenue - cost) / revenue) * 100) : 0}% of revenue`} tone="blue" />
        <Stat label="Loads delivered" value={loads.length} />
        <Stat label="Distance" value={km(distance)} hint={`$${distance ? (revenue / distance).toFixed(2) : 0}/km`} />
        <Stat label="On-time" value={`${loads.length ? Math.round((onTime / loads.length) * 100) : 0}%`} tone="violet" />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Revenue vs. direct costs"><RevenueChart data={months} /></Card>
        <Card title="On-time delivery % and loads per month">
          <TrendLine data={months} lines={[{ key: "onTimePct", name: "On-time %", color: "#10b981" }, { key: "loads", name: "Loads", color: "#2563eb" }]} height={260} />
        </Card>
        <Card title="Top customers by revenue"><SimpleBar data={byCustomer} dataKey="revenue" nameKey="name" money layout="vertical" height={300} /></Card>
        <Card title="Loads by equipment type"><Donut data={byEquipment} height={300} /></Card>
      </div>

      <Card title="Lane profitability" className="mt-6" bodyClassName="p-0">
        <Table head={["Lane", "Loads", "Revenue", "Margin", "Margin %", "Revenue / km"]}>
          {lanes.map((l) => (
            <tr key={l.lane}>
              <td className="font-medium">{l.lane}</td><td>{l.loads}</td><td>{money(l.revenue)}</td><td>{money(l.margin)}</td>
              <td className={l.marginPct < 0.25 ? "text-rose-600" : l.marginPct > 0.4 ? "text-emerald-600" : ""}>{Math.round(l.marginPct * 100)}%</td>
              <td>${l.perKm.toFixed(2)}</td>
            </tr>
          ))}
        </Table>
      </Card>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Card title="Truck performance" bodyClassName="p-0">
          <Table head={["Truck", "Loads", "Distance", "Revenue", "$/km"]}>
            {truckPerf.map((t) => (
              <tr key={t.id}><td><Link href={`/fleet/${t.id}`} className="text-blue-700 hover:underline">{t.unit}</Link></td><td>{t.loads}</td><td>{km(t.km)}</td><td>{money(t.revenue)}</td><td>${t.perKm.toFixed(2)}</td></tr>
            ))}
          </Table>
        </Card>
        <Card title="Driver performance" bodyClassName="p-0">
          <Table head={["Driver", "Loads", "Distance", "On-time", "Earnings"]}>
            {driverPerf.map((d) => (
              <tr key={d.id}><td><Link href={`/drivers/${d.id}`} className="text-blue-700 hover:underline">{d.name}</Link></td><td>{d.loads}</td><td>{km(d.km)}</td><td>{Math.round(d.onTime * 100)}%</td><td>{money(d.pay)}</td></tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  );
}
