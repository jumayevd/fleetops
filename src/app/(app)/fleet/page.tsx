import Link from "next/link";
import { Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { EQUIPMENT, EQUIPMENT_LABELS, TRUCK_STATUSES } from "@/lib/constants";
import { number, ago, daysUntil } from "@/lib/format";
import { saveTrailer } from "@/app/actions/fleet";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, ExpiryBadge, Field, Input, LinkButton, PageHeader, Select, Stat, Table, Tabs } from "@/components/ui";

export const metadata = { title: "Fleet" };

export default async function FleetPage({ searchParams }: PageProps<"/fleet">) {
  const user = await requireUser("fleet.view");
  const tab = (await searchParams).tab === "trailers" ? "trailers" : "trucks";
  const editable = can(user.role, "fleet.edit");

  const [trucks, trailers, activeLoads] = await Promise.all([
    db.truck.findMany({ orderBy: { unitNumber: "asc" }, include: { driver: { select: { id: true, name: true } } } }),
    db.trailer.findMany({ orderBy: { unitNumber: "asc" } }),
    db.load.findMany({ where: { status: { in: ["ASSIGNED", "IN_TRANSIT"] } }, select: { id: true, reference: true, truckId: true, trailerId: true, status: true } }),
  ]);
  const loadFor = (truckId: string) => activeLoads.find((l) => l.truckId === truckId);
  const loadForTrailer = (id: string) => activeLoads.find((l) => l.trailerId === id);
  const avgAge = trucks.reduce((a, t) => a + (new Date().getFullYear() - t.year), 0) / (trucks.length || 1);

  return (
    <>
      <PageHeader title="Fleet" subtitle="Trucks, trailers and their compliance status."
        actions={editable && tab === "trucks" && <LinkButton href="/fleet/new"><Plus className="h-4 w-4" />Add truck</LinkButton>} />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Trucks" value={trucks.length} hint={`${trucks.filter((t) => t.status === "ACTIVE").length} active`} />
        <Stat label="On a load" value={activeLoads.filter((l) => l.truckId).length} tone="violet" />
        <Stat label="In maintenance" value={trucks.filter((t) => t.status !== "ACTIVE").length} tone="amber" />
        <Stat label="Avg. truck age" value={`${avgAge.toFixed(1)} yrs`} hint={`${trailers.length} trailers`} />
      </div>

      <Tabs active={tab} tabs={[{ key: "trucks", label: `Trucks (${trucks.length})`, href: "/fleet" }, { key: "trailers", label: `Trailers (${trailers.length})`, href: "/fleet?tab=trailers" }]} />

      {tab === "trucks" ? (
        <Card bodyClassName="p-0">
          <Table head={["Unit", "Vehicle", "Status", "Driver", "Current load", "Odometer", "Service in", "Insurance", "Inspection", "Last ping"]}>
            {trucks.map((t) => {
              const l = loadFor(t.id);
              const svc = t.nextServiceKm != null ? t.nextServiceKm - t.odometerKm : null;
              return (
                <tr key={t.id}>
                  <td><Link href={`/fleet/${t.id}`} className="font-semibold text-blue-700 hover:underline">{t.unitNumber}</Link><span className="block text-xs text-slate-500">{t.plate}</span></td>
                  <td className="whitespace-nowrap">{t.make} {t.model}<span className="block text-xs text-slate-500">{t.year}</span></td>
                  <td><Badge value={t.status} /></td>
                  <td>{t.driver ? <Link href={`/drivers/${t.driver.id}`} className="hover:underline">{t.driver.name}</Link> : <span className="text-slate-400">—</span>}</td>
                  <td>{l ? <Link href={`/loads/${l.id}`} className="text-blue-700 hover:underline">{l.reference}</Link> : <span className="text-slate-400">Idle</span>}</td>
                  <td className="whitespace-nowrap">{number(t.odometerKm)} km</td>
                  <td className="whitespace-nowrap">{svc == null ? "—" : svc < 0 ? <Badge value="OUT_OF_SERVICE" label={`${number(-svc)} km over`} /> : svc < 2000 ? <Badge value="MAINTENANCE" label={`${number(svc)} km`} /> : `${number(svc)} km`}</td>
                  <td><ExpiryBadge days={daysUntil(t.insuranceExpiry)} /></td>
                  <td><ExpiryBadge days={daysUntil(t.inspectionExpiry)} /></td>
                  <td className="whitespace-nowrap text-xs text-slate-500">{ago(t.lastPingAt)}</td>
                </tr>
              );
            })}
          </Table>
        </Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-3">
          <Card bodyClassName="p-0" className="xl:col-span-2">
            <Table head={["Unit", "Type", "Capacity", "Plate", "Status", "Current load"]}>
              {trailers.map((t) => {
                const l = loadForTrailer(t.id);
                return (
                  <tr key={t.id}>
                    <td className="font-semibold">{t.unitNumber}</td>
                    <td>{EQUIPMENT_LABELS[t.type] ?? t.type}</td>
                    <td>{number(t.capacityKg)} kg</td>
                    <td>{t.plate ?? "—"}</td>
                    <td><Badge value={t.status} /></td>
                    <td>{l ? <Link href={`/loads/${l.id}`} className="text-blue-700 hover:underline">{l.reference}</Link> : <span className="text-slate-400">Available</span>}</td>
                  </tr>
                );
              })}
            </Table>
          </Card>
          {editable && (
            <Card title="Add trailer">
              <ActionForm action={saveTrailer.bind(null, null)} resetOnSuccess className="space-y-3">
                <Field label="Unit number *"><Input name="unitNumber" required placeholder="TR-220" /></Field>
                <Field label="Type"><Select name="type" options={EQUIPMENT.map((e) => ({ value: e, label: EQUIPMENT_LABELS[e] }))} /></Field>
                <Field label="Capacity (kg)"><Input name="capacityKg" type="number" defaultValue={22000} /></Field>
                <Field label="Plate"><Input name="plate" /></Field>
                <Field label="Status"><Select name="status" options={TRUCK_STATUSES} /></Field>
                <SubmitButton className="w-full">Add trailer</SubmitButton>
              </ActionForm>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
