import Link from "next/link";
import { Plus, Star } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { daysUntil, number, daysAgo } from "@/lib/format";
import { Badge, Card, ExpiryBadge, LinkButton, PageHeader, Stat, Table } from "@/components/ui";

export const metadata = { title: "Drivers" };

export default async function DriversPage() {
  const user = await requireUser("drivers.view");
  const since = daysAgo(30);
  const [drivers, active, recent] = await Promise.all([
    db.driver.findMany({ orderBy: { name: "asc" }, include: { truck: { select: { id: true, unitNumber: true } }, user: { select: { id: true } } } }),
    db.load.findMany({ where: { status: { in: ["ASSIGNED", "IN_TRANSIT"] } }, select: { id: true, reference: true, driverId: true } }),
    db.load.groupBy({ by: ["driverId"], where: { status: { in: ["DELIVERED", "INVOICED"] }, deliveredAt: { gte: since } }, _sum: { distanceKm: true }, _count: true }),
  ]);
  const statusCount = (s: string) => drivers.filter((d) => d.status === s).length;

  return (
    <>
      <PageHeader title="Drivers" subtitle="Your people on the road — availability, compliance and performance."
        actions={can(user.role, "drivers.edit") && <LinkButton href="/drivers/new"><Plus className="h-4 w-4" />Add driver</LinkButton>} />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Total" value={drivers.length} />
        <Stat label="Available" value={statusCount("AVAILABLE")} tone="green" />
        <Stat label="On duty" value={statusCount("ON_DUTY")} tone="blue" />
        <Stat label="Driving" value={statusCount("DRIVING")} tone="violet" />
        <Stat label="Off / leave" value={statusCount("OFF_DUTY") + statusCount("ON_LEAVE")} />
      </div>
      <Card bodyClassName="p-0">
        <Table head={["Driver", "Status", "Truck", "Current load", "License", "Medical", "30d km", "30d loads", "Rating", "App"]}>
          {drivers.map((d) => {
            const l = active.find((x) => x.driverId === d.id);
            const r = recent.find((x) => x.driverId === d.id);
            return (
              <tr key={d.id}>
                <td><Link href={`/drivers/${d.id}`} className="font-semibold text-blue-700 hover:underline">{d.name}</Link><span className="block text-xs text-slate-500">{d.phone}</span></td>
                <td><Badge value={d.status} /></td>
                <td>{d.truck ? <Link href={`/fleet/${d.truck.id}`} className="hover:underline">{d.truck.unitNumber}</Link> : <span className="text-slate-400">—</span>}</td>
                <td>{l ? <Link href={`/loads/${l.id}`} className="text-blue-700 hover:underline">{l.reference}</Link> : <span className="text-slate-400">—</span>}</td>
                <td><ExpiryBadge days={daysUntil(d.licenseExpiry)} /></td>
                <td><ExpiryBadge days={daysUntil(d.medicalExpiry)} /></td>
                <td>{number(r?._sum.distanceKm)}</td>
                <td>{r?._count ?? 0}</td>
                <td><span className="flex items-center gap-1"><Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />{d.rating.toFixed(1)}</span></td>
                <td>{d.user ? <Badge value="ACTIVE" label="Enabled" /> : <span className="text-xs text-slate-400">No login</span>}</td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </>
  );
}
