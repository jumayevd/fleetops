import "server-only";
import { db } from "./db";
import { estimatedArrival } from "./telemetry";

export type Alert = { level: "critical" | "warning"; title: string; detail: string; href: string };

const DAY = 86_400_000;

/** Operational exceptions that need a human: compliance, late loads, overdue money, service due. */
export async function getAlerts(): Promise<Alert[]> {
  const soon = new Date(Date.now() + 30 * DAY);
  const now = new Date();
  const [drivers, trucks, transit, overdue, unassigned] = await Promise.all([
    db.driver.findMany({ where: { OR: [{ licenseExpiry: { lte: soon } }, { medicalExpiry: { lte: soon } }] } }),
    db.truck.findMany({ where: { OR: [{ insuranceExpiry: { lte: soon } }, { inspectionExpiry: { lte: soon } }] } }),
    db.load.findMany({ where: { status: "IN_TRANSIT" } }),
    db.invoice.findMany({ where: { status: "SENT", dueAt: { lt: now } }, include: { customer: true } }),
    db.load.findMany({ where: { status: "PLANNED", pickupAt: { lte: new Date(Date.now() + DAY) } } }),
  ]);
  const allTrucks = await db.truck.findMany({ where: { nextServiceKm: { not: null } } });
  const docs = await db.document.findMany({
    where: { expiresAt: { lte: soon } },
    include: { truck: { select: { unitNumber: true } }, driver: { select: { name: true } }, customer: { select: { name: true } }, load: { select: { reference: true } } },
  });

  const alerts: Alert[] = [];
  const lvl = (d: Date) => (d < now ? "critical" : "warning") as Alert["level"];
  const when = (d: Date) => (d < now ? "expired" : `expires ${d.toLocaleDateString("en-GB")}`);

  for (const d of drivers) {
    if (d.licenseExpiry <= soon) alerts.push({ level: lvl(d.licenseExpiry), title: `${d.name}: driving license`, detail: when(d.licenseExpiry), href: `/drivers/${d.id}` });
    if (d.medicalExpiry && d.medicalExpiry <= soon) alerts.push({ level: lvl(d.medicalExpiry), title: `${d.name}: medical certificate`, detail: when(d.medicalExpiry), href: `/drivers/${d.id}` });
  }
  for (const t of trucks) {
    if (t.insuranceExpiry && t.insuranceExpiry <= soon) alerts.push({ level: lvl(t.insuranceExpiry), title: `${t.unitNumber}: insurance`, detail: when(t.insuranceExpiry), href: `/fleet/${t.id}` });
    if (t.inspectionExpiry && t.inspectionExpiry <= soon) alerts.push({ level: lvl(t.inspectionExpiry), title: `${t.unitNumber}: technical inspection`, detail: when(t.inspectionExpiry), href: `/fleet/${t.id}` });
  }
  for (const t of allTrucks) {
    const left = t.nextServiceKm! - t.odometerKm;
    if (left < 2000) alerts.push({ level: left < 0 ? "critical" : "warning", title: `${t.unitNumber}: service due`, detail: left < 0 ? `${-left} km overdue` : `in ${left} km`, href: `/fleet/${t.id}` });
  }
  for (const d of docs) {
    const who = d.truck?.unitNumber ?? d.driver?.name ?? d.customer?.name ?? d.load?.reference ?? "Document";
    const href = d.truckId ? `/fleet/${d.truckId}` : d.driverId ? `/drivers/${d.driverId}` : d.customerId ? `/customers/${d.customerId}` : `/loads/${d.loadId}`;
    alerts.push({ level: lvl(d.expiresAt!), title: `${who}: ${d.name}`, detail: `document ${when(d.expiresAt!)}`, href });
  }
  for (const l of transit) {
    const eta = estimatedArrival(l);
    if (eta && eta > l.deliveryAt) {
      const hrs = Math.round((eta.getTime() - l.deliveryAt.getTime()) / 3_600_000);
      alerts.push({ level: hrs > 6 ? "critical" : "warning", title: `${l.reference} running late`, detail: `ETA ~${hrs}h after delivery window`, href: `/loads/${l.id}` });
    }
  }
  for (const l of unassigned) alerts.push({ level: "warning", title: `${l.reference} not assigned`, detail: `pickup ${l.pickupAt.toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" })}`, href: `/loads/${l.id}` });
  for (const i of overdue) {
    const days = Math.floor((now.getTime() - i.dueAt.getTime()) / DAY);
    alerts.push({ level: days > 15 ? "critical" : "warning", title: `${i.number} overdue`, detail: `${i.customer.name} · ${days}d late`, href: `/finance/invoices/${i.id}` });
  }
  return alerts.sort((a, b) => (a.level === b.level ? 0 : a.level === "critical" ? -1 : 1));
}
