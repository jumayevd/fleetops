import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { getCurrentUser, requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { MAINTENANCE_TYPES, LOAD_STATUS_LABELS, type LoadStatus } from "@/lib/constants";
import { money, number, date, dateTime, ago, daysUntil, km, toDateInput, daysAgo } from "@/lib/format";
import { saveMaintenance, addFuelLog } from "@/app/actions/fleet";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, DL, ExpiryBadge, Field, Input, LinkButton, PageHeader, Select, Stat, Table } from "@/components/ui";
import { LeafletMap } from "@/components/map";
import { DocumentsPanel } from "@/components/documents/panel";
import { MaintenanceActions } from "../../maintenance/maintenance-actions";

export async function generateMetadata({ params }: PageProps<"/fleet/[id]">) {
  if (!(await getCurrentUser())) return {};
  const r = await db.truck.findUnique({ where: { id: (await params).id }, select: { unitNumber: true } });
  return { title: r?.unitNumber ?? "Not found" };
}

export default async function TruckDetail({ params }: PageProps<"/fleet/[id]">) {
  const user = await requireUser("fleet.view");
  const { id } = await params;
  const truck = await db.truck.findUnique({
    where: { id },
    include: {
      driver: true,
      maintenance: { orderBy: { scheduledAt: "desc" } },
      fuelLogs: { orderBy: { date: "desc" }, take: 15 },
      loads: { orderBy: { pickupAt: "desc" }, take: 12, include: { customer: { select: { name: true } } } },
    },
  });
  if (!truck) notFound();
  const editable = can(user.role, "fleet.edit");
  const since = daysAgo(90);
  const [agg90, fuel90, maint90] = await Promise.all([
    db.load.aggregate({ where: { truckId: id, status: { in: ["DELIVERED", "INVOICED"] }, deliveredAt: { gte: since } }, _sum: { rate: true, distanceKm: true }, _count: true }),
    db.fuelLog.aggregate({ where: { truckId: id, date: { gte: since } }, _sum: { cost: true, liters: true } }),
    db.maintenanceRecord.aggregate({ where: { truckId: id, scheduledAt: { gte: since }, status: "DONE" }, _sum: { cost: true } }),
  ]);
  const kms = agg90._sum.distanceKm ?? 0;
  const svc = truck.nextServiceKm != null ? truck.nextServiceKm - truck.odometerKm : null;

  return (
    <>
      <PageHeader
        title={`${truck.unitNumber} · ${truck.make} ${truck.model}`}
        subtitle={<span className="flex items-center gap-2"><Badge value={truck.status} />{truck.plate} · {truck.year} · VIN {truck.vin ?? "—"}</span>}
        actions={editable && <LinkButton href={`/fleet/${id}/edit`} variant="secondary"><Pencil className="h-4 w-4" />Edit</LinkButton>}
      />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Revenue (90d)" value={money(agg90._sum.rate)} hint={`${agg90._count} loads`} tone="green" />
        <Stat label="Distance (90d)" value={km(kms)} />
        <Stat label="Fuel (90d)" value={money(fuel90._sum.cost)} hint={kms ? `${(((fuel90._sum.liters ?? 0) / kms) * 100).toFixed(1)} L/100km` : undefined} tone="amber" />
        <Stat label="Maintenance (90d)" value={money(maint90._sum.cost)} tone="red" />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title="Loads" bodyClassName="p-0">
            <Table head={["Load", "Status", "Route", "Customer", "Pickup", "Rate"]} empty={truck.loads.length === 0}>
              {truck.loads.map((l) => (
                <tr key={l.id}>
                  <td><Link href={`/loads/${l.id}`} className="font-medium text-blue-700 hover:underline">{l.reference}</Link></td>
                  <td><Badge value={l.status} label={LOAD_STATUS_LABELS[l.status as LoadStatus]} /></td>
                  <td className="whitespace-nowrap">{l.originCity} → {l.destCity}</td>
                  <td className="max-w-40 truncate">{l.customer.name}</td>
                  <td className="whitespace-nowrap">{dateTime(l.pickupAt)}</td>
                  <td>{money(l.rate)}</td>
                </tr>
              ))}
            </Table>
          </Card>

          <Card title="Maintenance history" bodyClassName="p-0">
            <Table head={["Date", "Type", "Description", "Vendor", "Cost", "Status", ""]} empty={truck.maintenance.length === 0}>
              {truck.maintenance.map((m) => (
                <tr key={m.id}>
                  <td className="whitespace-nowrap">{date(m.completedAt ?? m.scheduledAt)}</td>
                  <td><Badge value="NORMAL" label={m.type.replace("_", " ").toLowerCase()} /></td>
                  <td>{m.description}</td>
                  <td className="text-slate-600">{m.vendor ?? "—"}</td>
                  <td>{money(m.cost)}</td>
                  <td><Badge value={m.status} /></td>
                  <td>{editable && <MaintenanceActions id={m.id} status={m.status} />}</td>
                </tr>
              ))}
            </Table>
          </Card>

          <Card title="Fuel log" bodyClassName="p-0">
            <Table head={["Date", "Station", "Liters", "Cost", "Odometer"]} empty={truck.fuelLogs.length === 0}>
              {truck.fuelLogs.map((f) => (
                <tr key={f.id}>
                  <td>{date(f.date)}</td><td>{f.station ?? "—"}</td><td>{number(f.liters)} L</td><td>{money(f.cost)}</td>
                  <td>{f.odometerKm ? `${number(f.odometerKm)} km` : "—"}</td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Location" bodyClassName="p-2">
            <LeafletMap height={220} trucks={[{ id: truck.id, unitNumber: truck.unitNumber, lat: truck.lat, lng: truck.lng, heading: truck.heading ?? 0, speedKmh: truck.speedKmh ?? 0, status: truck.status, moving: (truck.speedKmh ?? 0) > 1 }]} />
            <p className="px-2 pt-2 text-xs text-slate-500">Last ping {ago(truck.lastPingAt)} · {truck.pingSource === "DEVICE" ? "driver GPS" : "route estimate"}</p>
          </Card>
          <Card title="Details">
            <DL items={[
              ["Driver", truck.driver ? <Link key="d" href={`/drivers/${truck.driver.id}`} className="text-blue-700 hover:underline">{truck.driver.name}</Link> : "—"],
              ["Odometer", `${number(truck.odometerKm)} km`],
              ["Next service", svc == null ? "—" : svc < 0 ? `${number(-svc)} km overdue` : `in ${number(svc)} km`],
              ["Fuel", `${truck.fuelType} · ${truck.fuelCapacityL} L`],
              ["Insurance", <ExpiryBadge key="i" days={daysUntil(truck.insuranceExpiry)} />],
              ["Inspection", <ExpiryBadge key="n" days={daysUntil(truck.inspectionExpiry)} />],
            ]} />
          </Card>
          <DocumentsPanel user={user} target={{ type: "truck", id }} path={`/fleet/${id}`} withExpiry />
          {editable && (
            <Card title="New work order">
              <ActionForm action={saveMaintenance} resetOnSuccess className="space-y-3">
                <input type="hidden" name="truckId" value={id} />
                <Field label="Type"><Select name="type" options={MAINTENANCE_TYPES} /></Field>
                <Field label="Description *"><Input name="description" required /></Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Date"><Input name="scheduledAt" type="date" defaultValue={toDateInput(new Date())} /></Field>
                  <Field label="Est. cost"><Input name="cost" type="number" /></Field>
                </div>
                <Field label="Vendor"><Input name="vendor" /></Field>
                <Field label="Status"><Select name="status" options={["SCHEDULED", "IN_PROGRESS", "DONE"]} /></Field>
                <SubmitButton className="w-full">Create work order</SubmitButton>
              </ActionForm>
            </Card>
          )}
          {editable && (
            <Card title="Log fuel">
              <ActionForm action={addFuelLog.bind(null, id)} resetOnSuccess className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Liters *"><Input name="liters" type="number" step="0.1" required /></Field>
                  <Field label="Cost (USD) *"><Input name="cost" type="number" step="0.01" required /></Field>
                </div>
                <Field label="Odometer"><Input name="odometerKm" type="number" /></Field>
                <Field label="Station"><Input name="station" /></Field>
                <SubmitButton variant="secondary" className="w-full">Add fuel entry</SubmitButton>
              </ActionForm>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
