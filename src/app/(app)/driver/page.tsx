import { redirect } from "next/navigation";
import { MapPin, Flag, Package, Thermometer, AlertTriangle, Phone } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { EQUIPMENT_LABELS } from "@/lib/constants";
import { dateTime, km, kg, money, date } from "@/lib/format";
import { loadProgress, estimatedArrival, syncSimulatedPositions } from "@/lib/telemetry";
import { routePolyline } from "@/lib/geo";
import { driverUpdateLoad } from "@/app/actions/driver";
import { addLoadEvent } from "@/app/actions/loads";
import { addFuelLog } from "@/app/actions/fleet";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, Field, Input, Progress, Select } from "@/components/ui";
import { LeafletMap } from "@/components/map";
import { DocumentsPanel } from "@/components/documents/panel";
import { GpsShare } from "./gps-share";
import { StatusToggle } from "./status-toggle";

export const metadata = { title: "My loads" };

export default async function DriverPortal() {
  const user = await requireUser("driver.portal");
  if (!user.driver) redirect("/account");
  await syncSimulatedPositions();
  const driver = await db.driver.findUniqueOrThrow({ where: { id: user.driver.id }, include: { truck: true } });
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const [active, upcoming, recent, month] = await Promise.all([
    db.load.findFirst({
      where: { driverId: driver.id, status: { in: ["IN_TRANSIT", "ASSIGNED"] } },
      orderBy: [{ status: "desc" }, { pickupAt: "asc" }], // IN_TRANSIT sorts before ASSIGNED
      include: { trailer: true, dispatcher: { select: { name: true, phone: true } }, events: { orderBy: { createdAt: "desc" }, take: 5 } },
    }),
    db.load.findMany({ where: { driverId: driver.id, status: "ASSIGNED" }, orderBy: { pickupAt: "asc" } }),
    db.load.findMany({ where: { driverId: driver.id, status: { in: ["DELIVERED", "INVOICED"] } }, orderBy: { deliveredAt: "desc" }, take: 5 }),
    db.load.aggregate({ where: { driverId: driver.id, status: { in: ["DELIVERED", "INVOICED"] }, deliveredAt: { gte: monthStart } }, _sum: { driverPay: true, distanceKm: true }, _count: true }),
  ]);
  const next = upcoming.filter((l) => l.id !== active?.id);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Hi, {driver.name.split(" ")[0]} 👋</h1>
        <p className="text-sm text-slate-500">{driver.truck ? `Truck ${driver.truck.unitNumber} · ${driver.truck.plate}` : "No truck assigned"}</p>
      </div>
      <StatusToggle status={driver.status} />
      {driver.truck && <GpsShare />}

      {active ? (
        <Card bodyClassName="p-0" className="overflow-hidden">
          <div className="flex items-center justify-between bg-slate-900 px-5 py-3 text-white">
            <span className="font-semibold">{active.reference}</span>
            <Badge value={active.status} />
          </div>
          <div className="space-y-4 p-5">
            <div className="flex gap-3">
              <MapPin className="mt-1 h-5 w-5 shrink-0 text-emerald-500" />
              <div>
                <p className="text-xs uppercase text-slate-500">Pickup · {dateTime(active.pickupAt)}</p>
                <p className="font-semibold">{active.originName}</p>
                <a className="text-sm text-blue-600" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${active.originLat},${active.originLng}`}>Navigate →</a>
              </div>
            </div>
            <div className="flex gap-3">
              <Flag className="mt-1 h-5 w-5 shrink-0 text-rose-500" />
              <div>
                <p className="text-xs uppercase text-slate-500">Deliver by · {dateTime(active.deliveryAt)}</p>
                <p className="font-semibold">{active.destName}</p>
                <a className="text-sm text-blue-600" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/dir/?api=1&destination=${active.destLat},${active.destLng}`}>Navigate →</a>
              </div>
            </div>
            {active.status === "IN_TRANSIT" && (
              <div>
                <Progress value={loadProgress(active)} />
                <p className="mt-1 text-xs text-slate-500">{km(active.distanceKm)} · ETA {dateTime(estimatedArrival(active))}</p>
              </div>
            )}
            <LeafletMap height={220} fitKey={active.id}
              points={[{ lat: active.originLat, lng: active.originLng, label: active.originName, kind: "origin" }, { lat: active.destLat, lng: active.destLng, label: active.destName, kind: "dest" }]}
              trucks={driver.truck && active.status === "IN_TRANSIT" ? [{ id: driver.truck.id, unitNumber: driver.truck.unitNumber, lat: driver.truck.lat, lng: driver.truck.lng, heading: driver.truck.heading ?? 0, speedKmh: driver.truck.speedKmh ?? 0, status: "ACTIVE", moving: true, route: routePolyline({ lat: active.originLat, lng: active.originLng }, { lat: active.destLat, lng: active.destLng }) }] : []} />
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg bg-slate-50 p-2"><Package className="mb-1 h-4 w-4 text-slate-400" />{active.commodity}<span className="block text-xs text-slate-500">{kg(active.weightKg)}{active.pallets ? ` · ${active.pallets} pallets` : ""}</span></div>
              <div className="rounded-lg bg-slate-50 p-2">{active.temperatureC != null ? <Thermometer className="mb-1 h-4 w-4 text-blue-500" /> : <Package className="mb-1 h-4 w-4 text-slate-400" />}
                {EQUIPMENT_LABELS[active.equipment]}{active.trailer && ` · ${active.trailer.unitNumber}`}
                <span className="block text-xs text-slate-500">{active.temperatureC != null ? `Keep at ${active.temperatureC}°C` : active.hazmat ? "HAZMAT — ADR rules apply" : "Standard cargo"}</span>
              </div>
            </div>
            {active.notes && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{active.notes}</p>}
            {active.dispatcher && (
              <p className="flex items-center justify-between rounded-lg border border-slate-100 p-3 text-sm">
                <span>Dispatcher: <b>{active.dispatcher.name}</b></span>
                {active.dispatcher.phone && <a href={`tel:${active.dispatcher.phone}`} className="flex items-center gap-1 text-blue-600"><Phone className="h-4 w-4" />Call</a>}
              </p>
            )}

            {active.status === "ASSIGNED" && (
              <ActionForm action={driverUpdateLoad.bind(null, active.id)}>
                <input type="hidden" name="status" value="IN_TRANSIT" />
                <SubmitButton className="w-full py-3 text-base" pendingText="Starting…">I&apos;ve picked up — start trip</SubmitButton>
              </ActionForm>
            )}
            {active.status === "IN_TRANSIT" && (
              <ActionForm action={driverUpdateLoad.bind(null, active.id)} className="space-y-2" confirm="Confirm the load has been delivered?">
                <input type="hidden" name="status" value="DELIVERED" />
                <Field label="Proof of delivery — signed by"><Input name="podSignedBy" required placeholder="Receiver's name" /></Field>
                <SubmitButton variant="success" className="w-full py-3 text-base" pendingText="Confirming…">Confirm delivery</SubmitButton>
              </ActionForm>
            )}
          </div>
          <div className="border-t border-slate-100 p-5">
            <p className="mb-2 text-sm font-semibold">Trip documents</p>
            <p className="mb-3 text-xs text-slate-500">Snap the signed POD, CMR or BOL — dispatch and billing get it instantly.</p>
            <DocumentsPanel user={user} target={{ type: "load", id: active.id }} path="/driver" camera plain defaultKind={active.status === "IN_TRANSIT" ? "POD" : "BOL"} />
          </div>
          <div className="border-t border-slate-100 p-5">
            <p className="mb-2 text-sm font-semibold">Send update to dispatch</p>
            <ActionForm action={addLoadEvent.bind(null, active.id)} resetOnSuccess className="space-y-2">
              <Select name="type" options={[{ value: "CHECK_CALL", label: "Check-in (all good)" }, { value: "ISSUE", label: "Report a problem" }, { value: "NOTE", label: "Note" }]} />
              <Input name="message" required placeholder="e.g. At border, 2h queue" />
              <SubmitButton variant="secondary" className="w-full">Send</SubmitButton>
            </ActionForm>
            {active.events.length > 0 && (
              <ul className="mt-4 space-y-2 text-xs text-slate-600">
                {active.events.map((e) => <li key={e.id} className="flex gap-2">{e.type === "ISSUE" && <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />}<span className="text-slate-400">{dateTime(e.createdAt)}</span> {e.message}</li>)}
              </ul>
            )}
          </div>
        </Card>
      ) : (
        <Card><p className="py-6 text-center text-sm text-slate-500">No active load right now. Dispatch will assign your next trip here.</p></Card>
      )}

      {next.length > 0 && (
        <Card title="Next up" bodyClassName="p-0">
          <ul className="divide-y divide-slate-100">
            {next.map((l) => (
              <li key={l.id} className="px-5 py-3 text-sm">
                <p className="font-semibold">{l.reference}: {l.originCity} → {l.destCity}</p>
                <p className="text-xs text-slate-500">Pickup {dateTime(l.pickupAt)} · {l.commodity}</p>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-center"><p className="text-xs text-slate-500">Loads this month</p><p className="text-xl font-semibold">{month._count}</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-center"><p className="text-xs text-slate-500">Distance</p><p className="text-xl font-semibold">{km(month._sum.distanceKm)}</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-center"><p className="text-xs text-slate-500">Earnings</p><p className="text-xl font-semibold text-emerald-600">{money(month._sum.driverPay)}</p></div>
      </div>

      {driver.truck && (
        <Card title="Log fuel">
          <ActionForm action={addFuelLog.bind(null, driver.truck.id)} resetOnSuccess className="grid grid-cols-2 gap-3">
            <Field label="Liters"><Input name="liters" type="number" step="0.1" required inputMode="decimal" /></Field>
            <Field label="Cost (USD)"><Input name="cost" type="number" step="0.01" required inputMode="decimal" /></Field>
            <Field label="Odometer"><Input name="odometerKm" type="number" inputMode="numeric" /></Field>
            <Field label="Station"><Input name="station" /></Field>
            <SubmitButton variant="secondary" className="col-span-2">Save fuel entry</SubmitButton>
          </ActionForm>
        </Card>
      )}

      {recent.length > 0 && (
        <Card title="Recently delivered" bodyClassName="p-0">
          <ul className="divide-y divide-slate-100">
            {recent.map((l) => (
              <li key={l.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <span><b>{l.reference}</b> {l.originCity} → {l.destCity}<span className="block text-xs text-slate-500">{date(l.deliveredAt)}</span></span>
                <span className="font-medium text-emerald-600">{money(l.driverPay)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
