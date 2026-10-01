import "server-only";
import { format, startOfMonth, subMonths } from "date-fns";
import { db } from "./db";

const COMPLETED = ["DELIVERED", "INVOICED"];

export async function monthlyFinancials(months = 6) {
  const from = startOfMonth(subMonths(new Date(), months - 1));
  const loads = await db.load.findMany({
    where: { status: { in: COMPLETED }, deliveredAt: { gte: from } },
    select: { deliveredAt: true, rate: true, driverPay: true, fuelCost: true, otherCost: true, distanceKm: true, deliveryAt: true },
  });
  const buckets = new Map<string, { month: string; revenue: number; cost: number; loads: number; km: number; onTime: number }>();
  for (let i = 0; i < months; i++) {
    const m = format(subMonths(new Date(), months - 1 - i), "MMM yy");
    buckets.set(m, { month: m, revenue: 0, cost: 0, loads: 0, km: 0, onTime: 0 });
  }
  for (const l of loads) {
    const b = buckets.get(format(l.deliveredAt!, "MMM yy"));
    if (!b) continue;
    b.revenue += l.rate;
    b.cost += l.driverPay + l.fuelCost + l.otherCost;
    b.loads += 1;
    b.km += l.distanceKm;
    if (l.deliveredAt! <= l.deliveryAt) b.onTime += 1;
  }
  return [...buckets.values()].map((b) => ({
    ...b,
    revenue: Math.round(b.revenue),
    cost: Math.round(b.cost),
    margin: Math.round(b.revenue - b.cost),
    onTimePct: b.loads ? Math.round((b.onTime / b.loads) * 100) : 0,
    revPerKm: b.km ? Math.round((b.revenue / b.km) * 100) / 100 : 0,
  }));
}

export async function receivables() {
  const open = await db.invoice.findMany({ where: { status: "SENT" } });
  const now = Date.now();
  const aging = { current: 0, "1-30": 0, "31-60": 0, "60+": 0 };
  for (const i of open) {
    const late = Math.floor((now - i.dueAt.getTime()) / 86_400_000);
    const amt = i.amount * (1 + i.taxRate);
    if (late <= 0) aging.current += amt;
    else if (late <= 30) aging["1-30"] += amt;
    else if (late <= 60) aging["31-60"] += amt;
    else aging["60+"] += amt;
  }
  const total = Object.values(aging).reduce((a, b) => a + b, 0);
  const overdue = total - aging.current;
  return { aging, total, overdue, count: open.length };
}

/** Month-to-date revenue vs. the same number of days into last month (fair early-month comparison). */
export async function revenueMtdComparison() {
  const now = new Date();
  const thisStart = startOfMonth(now);
  const lastStart = startOfMonth(subMonths(now, 1));
  const lastSameDay = new Date(lastStart.getTime() + (now.getTime() - thisStart.getTime()));
  const sum = (gte: Date, lt: Date) =>
    db.load.aggregate({ where: { status: { in: COMPLETED }, deliveredAt: { gte, lt } }, _sum: { rate: true } }).then((r) => r._sum.rate ?? 0);
  const [mtd, prior] = await Promise.all([sum(thisStart, now), sum(lastStart, lastSameDay)]);
  return { mtd, prior };
}
