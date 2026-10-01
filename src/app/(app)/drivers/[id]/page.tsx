import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Phone, Mail, Star } from "lucide-react";
import { getCurrentUser, requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { LOAD_STATUS_LABELS, type LoadStatus } from "@/lib/constants";
import { money, date, dateTime, daysUntil, km } from "@/lib/format";
import { DocumentsPanel } from "@/components/documents/panel";
import { Badge, Card, DL, ExpiryBadge, LinkButton, PageHeader, Stat, Table } from "@/components/ui";

export async function generateMetadata({ params }: PageProps<"/drivers/[id]">) {
  if (!(await getCurrentUser())) return {};
  const r = await db.driver.findUnique({ where: { id: (await params).id }, select: { name: true } });
  return { title: r?.name ?? "Not found" };
}

export default async function DriverDetail({ params }: PageProps<"/drivers/[id]">) {
  const user = await requireUser("drivers.view");
  const { id } = await params;
  const driver = await db.driver.findUnique({
    where: { id },
    include: {
      truck: true, user: { select: { email: true, lastLoginAt: true } },
      loads: { orderBy: { pickupAt: "desc" }, take: 20, include: { customer: { select: { name: true } } } },
    },
  });
  if (!driver) notFound();

  const done = await db.load.findMany({ where: { driverId: id, status: { in: ["DELIVERED", "INVOICED"] } }, select: { distanceKm: true, driverPay: true, deliveredAt: true, deliveryAt: true, rate: true } });
  const onTime = done.filter((l) => l.deliveredAt && l.deliveredAt <= l.deliveryAt).length;
  const totalKm = done.reduce((a, l) => a + l.distanceKm, 0);
  const totalPay = done.reduce((a, l) => a + l.driverPay, 0);
  const showMoney = can(user.role, "finance.view") || can(user.role, "drivers.edit");

  return (
    <>
      <PageHeader
        title={driver.name}
        subtitle={<span className="flex flex-wrap items-center gap-3"><Badge value={driver.status} />
          {driver.phone && <a href={`tel:${driver.phone}`} className="flex items-center gap-1 hover:underline"><Phone className="h-3.5 w-3.5" />{driver.phone}</a>}
          {driver.email && <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{driver.email}</span>}
        </span>}
        actions={can(user.role, "drivers.edit") && <LinkButton href={`/drivers/${id}/edit`} variant="secondary"><Pencil className="h-4 w-4" />Edit</LinkButton>}
      />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Completed loads" value={done.length} />
        <Stat label="Distance driven" value={km(totalKm)} tone="blue" />
        <Stat label="On-time rate" value={done.length ? `${Math.round((onTime / done.length) * 100)}%` : "—"} tone="green" />
        {showMoney ? <Stat label="Total earnings" value={money(totalPay)} hint={`$${driver.payPerKm.toFixed(2)}/km`} tone="violet" />
          : <Stat label="Rating" value={driver.rating.toFixed(1)} />}
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Load history" className="xl:col-span-2" bodyClassName="p-0">
          <Table head={["Load", "Status", "Route", "Customer", "Pickup", "Distance", ...(showMoney ? ["Pay"] : [])]} empty={driver.loads.length === 0}>
            {driver.loads.map((l) => (
              <tr key={l.id}>
                <td><Link href={`/loads/${l.id}`} className="font-medium text-blue-700 hover:underline">{l.reference}</Link></td>
                <td><Badge value={l.status} label={LOAD_STATUS_LABELS[l.status as LoadStatus]} /></td>
                <td className="whitespace-nowrap">{l.originCity} → {l.destCity}</td>
                <td className="max-w-40 truncate">{l.customer.name}</td>
                <td className="whitespace-nowrap">{dateTime(l.pickupAt)}</td>
                <td>{km(l.distanceKm)}</td>
                {showMoney && <td>{money(l.driverPay)}</td>}
              </tr>
            ))}
          </Table>
        </Card>
        <div className="space-y-6">
          <Card title="Compliance">
            <DL items={[
              ["License", `${driver.licenseNumber} (${driver.licenseClass})`],
              ["License expiry", <span key="l">{date(driver.licenseExpiry)} <ExpiryBadge days={daysUntil(driver.licenseExpiry)} /></span>],
              ["Medical expiry", <span key="m">{date(driver.medicalExpiry)} <ExpiryBadge days={daysUntil(driver.medicalExpiry)} /></span>],
              ["Hired", date(driver.hireDate)],
            ]} />
          </Card>
          <Card title="Assignment">
            <DL items={[
              ["Truck", driver.truck ? <Link key="t" href={`/fleet/${driver.truck.id}`} className="text-blue-700 hover:underline">{driver.truck.unitNumber} · {driver.truck.make}</Link> : "—"],
              ["Rating", <span key="r" className="flex items-center gap-1"><Star className="h-4 w-4 fill-amber-400 text-amber-400" />{driver.rating.toFixed(1)}</span>],
              ["App login", driver.user ? driver.user.email : "Not enabled"],
              ["Last seen", driver.user?.lastLoginAt ? dateTime(driver.user.lastLoginAt) : "—"],
            ]} />
          </Card>
          <DocumentsPanel user={user} target={{ type: "driver", id }} path={`/drivers/${id}`} withExpiry />
          {driver.notes && <Card title="Notes"><p className="whitespace-pre-wrap text-sm text-slate-700">{driver.notes}</p></Card>}
        </div>
      </div>
    </>
  );
}
