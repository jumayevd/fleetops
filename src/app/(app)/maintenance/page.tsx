import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { MAINTENANCE_TYPES } from "@/lib/constants";
import { money, date, number, toDateInput, daysAgo } from "@/lib/format";
import { saveMaintenance } from "@/app/actions/fleet";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, Field, Input, PageHeader, Select, Stat, Table } from "@/components/ui";
import { MaintenanceActions } from "./maintenance-actions";

export const metadata = { title: "Maintenance" };

export default async function MaintenancePage() {
  const user = await requireUser("fleet.view");
  const editable = can(user.role, "fleet.edit");
  const since = daysAgo(180);
  const [open, done, trucks, spend] = await Promise.all([
    db.maintenanceRecord.findMany({ where: { status: { not: "DONE" } }, orderBy: { scheduledAt: "asc" }, include: { truck: true } }),
    db.maintenanceRecord.findMany({ where: { status: "DONE" }, orderBy: { completedAt: "desc" }, take: 25, include: { truck: true } }),
    db.truck.findMany({ orderBy: { unitNumber: "asc" } }),
    db.maintenanceRecord.aggregate({ where: { status: "DONE", completedAt: { gte: since } }, _sum: { cost: true }, _count: true }),
  ]);
  const dueSoon = trucks
    .filter((t) => t.nextServiceKm != null && t.nextServiceKm - t.odometerKm < 5000)
    .sort((a, b) => a.nextServiceKm! - a.odometerKm - (b.nextServiceKm! - b.odometerKm));

  return (
    <>
      <PageHeader title="Maintenance" subtitle="Work orders, service intervals and repair spend." />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Open work orders" value={open.length} tone="amber" />
        <Stat label="In the shop" value={trucks.filter((t) => t.status === "MAINTENANCE").length} tone="red" />
        <Stat label="Service due < 5,000 km" value={dueSoon.length} tone="blue" />
        <Stat label="Spend (180d)" value={money(spend._sum.cost)} hint={`${spend._count} jobs`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title="Open work orders" bodyClassName="p-0">
            <Table head={["Scheduled", "Truck", "Type", "Description", "Vendor", "Est. cost", "Status", ""]} empty={open.length === 0}>
              {open.map((m) => (
                <tr key={m.id}>
                  <td className="whitespace-nowrap">{date(m.scheduledAt)}</td>
                  <td><Link href={`/fleet/${m.truckId}`} className="font-medium text-blue-700 hover:underline">{m.truck.unitNumber}</Link></td>
                  <td className="whitespace-nowrap text-xs">{m.type.replace("_", " ")}</td>
                  <td>{m.description}</td>
                  <td className="text-slate-600">{m.vendor ?? "—"}</td>
                  <td>{money(m.cost)}</td>
                  <td><Badge value={m.status} /></td>
                  <td>{editable && <MaintenanceActions id={m.id} status={m.status} />}</td>
                </tr>
              ))}
            </Table>
          </Card>
          <Card title="Service due by odometer" bodyClassName="p-0">
            <Table head={["Truck", "Odometer", "Next service at", "Remaining"]} empty={dueSoon.length === 0}>
              {dueSoon.map((t) => {
                const left = t.nextServiceKm! - t.odometerKm;
                return (
                  <tr key={t.id}>
                    <td><Link href={`/fleet/${t.id}`} className="font-medium text-blue-700 hover:underline">{t.unitNumber}</Link></td>
                    <td>{number(t.odometerKm)} km</td>
                    <td>{number(t.nextServiceKm)} km</td>
                    <td>{left < 0 ? <Badge value="OUT_OF_SERVICE" label={`${number(-left)} km overdue`} /> : <Badge value="MAINTENANCE" label={`${number(left)} km`} />}</td>
                  </tr>
                );
              })}
            </Table>
          </Card>
          <Card title="Recently completed" bodyClassName="p-0">
            <Table head={["Completed", "Truck", "Description", "Vendor", "Cost"]}>
              {done.map((m) => (
                <tr key={m.id}>
                  <td>{date(m.completedAt)}</td>
                  <td><Link href={`/fleet/${m.truckId}`} className="text-blue-700 hover:underline">{m.truck.unitNumber}</Link></td>
                  <td>{m.description}</td><td className="text-slate-600">{m.vendor ?? "—"}</td><td>{money(m.cost)}</td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>
        {editable && (
          <Card title="Schedule work order" className="h-fit">
            <ActionForm action={saveMaintenance} resetOnSuccess className="space-y-3">
              <Field label="Truck *"><Select name="truckId" required placeholder="Select…" options={trucks.map((t) => ({ value: t.id, label: `${t.unitNumber} · ${t.make} ${t.model}` }))} /></Field>
              <Field label="Type"><Select name="type" options={MAINTENANCE_TYPES} /></Field>
              <Field label="Description *"><Input name="description" required placeholder="e.g. Replace brake pads" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Date"><Input name="scheduledAt" type="date" defaultValue={toDateInput(new Date())} /></Field>
                <Field label="Est. cost"><Input name="cost" type="number" /></Field>
              </div>
              <Field label="Vendor"><Input name="vendor" /></Field>
              <Field label="Status" hint="In progress puts the truck into maintenance status"><Select name="status" options={["SCHEDULED", "IN_PROGRESS", "DONE"]} /></Field>
              <SubmitButton className="w-full">Create</SubmitButton>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
