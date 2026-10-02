import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, MapPin, Flag, Thermometer, AlertTriangle, FileText, Phone } from "lucide-react";
import { getCurrentUser, requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { LOAD_STATUS_LABELS, LOAD_TRANSITIONS, EQUIPMENT_LABELS, type LoadStatus } from "@/lib/constants";
import { money, dateTime, km, kg, ago } from "@/lib/format";
import { loadProgress, estimatedArrival, syncSimulatedPositions } from "@/lib/telemetry";
import { routePolyline } from "@/lib/geo";
import { assignLoad, setLoadStatus, addLoadEvent, deleteLoad } from "@/app/actions/loads";
import { invoiceLoad } from "@/app/actions/finance";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, DL, Field, Input, LinkButton, PageHeader, Progress, Select, buttonClass } from "@/components/ui";
import { LeafletMap } from "@/components/map";
import { DocumentsPanel } from "@/components/documents/panel";
import { assignmentOptions } from "../options";

const TRANSITION_UI: Partial<Record<LoadStatus, { label: string; variant: "primary" | "secondary" | "danger" | "success" }>> = {
  IN_TRANSIT: { label: "Mark picked up / depart", variant: "primary" },
  DELIVERED: { label: "Confirm delivery", variant: "success" },
  INVOICED: { label: "Generate invoice", variant: "primary" },
  CANCELLED: { label: "Cancel load", variant: "danger" },
  PLANNED: { label: "Unassign / re-plan", variant: "secondary" },
};

const EVENT_DOT: Record<string, string> = {
  CREATED: "bg-slate-400", ASSIGNED: "bg-blue-500", STATUS: "bg-violet-500", NOTE: "bg-slate-300", CHECK_CALL: "bg-emerald-500", ISSUE: "bg-rose-500",
};

export async function generateMetadata({ params }: PageProps<"/loads/[id]">) {
  if (!(await getCurrentUser())) return {};
  const r = await db.load.findUnique({ where: { id: (await params).id }, select: { reference: true } });
  return { title: r?.reference ?? "Not found" };
}

export default async function LoadDetail({ params }: PageProps<"/loads/[id]">) {
  const user = await requireUser("loads.view");
  const { id } = await params;
  await syncSimulatedPositions();
  const load = await db.load.findUnique({
    where: { id },
    include: {
      customer: true, truck: true, trailer: true, driver: true, dispatcher: { select: { name: true } }, invoice: true,
      events: { orderBy: { createdAt: "desc" }, include: { user: { select: { name: true } } } },
    },
  });
  if (!load) notFound();

  const editable = can(user.role, "loads.edit");
  const showMoney = can(user.role, "finance.view") || editable;
  const status = load.status as LoadStatus;
  const transitions = LOAD_TRANSITIONS[status].filter((t) => t !== "ASSIGNED");
  const opts = editable && ["PLANNED", "ASSIGNED"].includes(status) ? await assignmentOptions(id) : null;
  const progress = status === "IN_TRANSIT" ? loadProgress(load) : ["DELIVERED", "INVOICED"].includes(status) ? 1 : 0;
  const eta = status === "IN_TRANSIT" ? estimatedArrival(load) : null;
  const late = eta && eta > load.deliveryAt;
  const cost = load.driverPay + load.fuelCost + load.otherCost;
  const margin = load.rate - cost;
  const origin = { lat: load.originLat, lng: load.originLng };
  const dest = { lat: load.destLat, lng: load.destLng };

  return (
    <>
      <PageHeader
        title={load.reference}
        subtitle={<span className="flex flex-wrap items-center gap-2">
          <Badge value={status} label={LOAD_STATUS_LABELS[status]} />
          {load.priority !== "NORMAL" && <Badge value={load.priority} />}
          {load.hazmat && <Badge value="URGENT" label="Hazmat" />}
          <span>{load.customer.name} · booked by {load.dispatcher?.name ?? "—"} {ago(load.createdAt)}</span>
        </span>}
        actions={editable && (
          <>
            {!["INVOICED"].includes(status) && <LinkButton href={`/loads/${id}/edit`} variant="secondary"><Pencil className="h-4 w-4" />Edit</LinkButton>}
            {transitions.map((t) => {
              if (t === "INVOICED") return null; // handled in finance card
              const ui = TRANSITION_UI[t]!;
              return (
                <ActionForm key={t} action={setLoadStatus.bind(null, id)} className="flex items-center gap-2"
                  confirm={t === "CANCELLED" ? `Cancel ${load.reference}?` : undefined}>
                  <input type="hidden" name="status" value={t} />
                  {t === "DELIVERED" && <Input name="podSignedBy" placeholder="POD signed by" className="w-40" required />}
                  <SubmitButton variant={ui.variant}>{ui.label}</SubmitButton>
                </ActionForm>
              );
            })}
          </>
        )}
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card bodyClassName="p-0">
            <div className="grid gap-0 md:grid-cols-[1fr_1.4fr]">
              <div className="space-y-5 p-5">
                <div className="flex gap-3">
                  <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Pickup</p>
                    <p className="font-semibold">{load.originName}</p>
                    <p className="text-sm text-slate-600">{load.originCity} · {dateTime(load.pickupAt)}</p>
                    {load.departedAt && <p className="text-xs text-emerald-600">Departed {dateTime(load.departedAt)}</p>}
                  </div>
                </div>
                <div className="flex gap-3">
                  <Flag className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" />
                  <div>
                    <p className="text-xs uppercase tracking-wide text-slate-500">Delivery</p>
                    <p className="font-semibold">{load.destName}</p>
                    <p className="text-sm text-slate-600">{load.destCity} · by {dateTime(load.deliveryAt)}</p>
                    {load.deliveredAt && (
                      <p className={load.deliveredAt <= load.deliveryAt ? "text-xs text-emerald-600" : "text-xs text-rose-600"}>
                        Delivered {dateTime(load.deliveredAt)} {load.deliveredAt <= load.deliveryAt ? "(on time)" : "(late)"}{load.podSignedBy && ` · POD: ${load.podSignedBy}`}
                      </p>
                    )}
                  </div>
                </div>
                <div>
                  <div className="mb-1 flex justify-between text-xs text-slate-500"><span>{km(load.distanceKm)}</span><span>{Math.round(progress * 100)}%</span></div>
                  <Progress value={progress} />
                  {eta && (
                    <p className={`mt-2 flex items-center gap-1 text-sm ${late ? "text-rose-600" : "text-slate-600"}`}>
                      {late && <AlertTriangle className="h-4 w-4" />}ETA {dateTime(eta)} {late ? "— projected late" : "— on schedule"}
                    </p>
                  )}
                </div>
              </div>
              <div className="p-2">
                <LeafletMap height={300} fitKey={id}
                  points={[{ ...origin, label: `Pickup: ${load.originName}`, kind: "origin" }, { ...dest, label: `Delivery: ${load.destName}`, kind: "dest" }]}
                  trucks={load.truck && status === "IN_TRANSIT" ? [{
                    id: load.truck.id, unitNumber: load.truck.unitNumber, lat: load.truck.lat, lng: load.truck.lng,
                    heading: load.truck.heading ?? 0, speedKmh: load.truck.speedKmh ?? 0, status: load.truck.status,
                    driverName: load.driver?.name, moving: true, route: routePolyline(origin, dest),
                  }] : []}
                />
              </div>
            </div>
          </Card>

          <Card title="Cargo">
            <DL items={[
              ["Commodity", load.commodity],
              ["Equipment", EQUIPMENT_LABELS[load.equipment] ?? load.equipment],
              ["Weight", kg(load.weightKg)],
              ["Pallets", load.pallets ?? "—"],
              ...(load.temperatureC != null ? [["Temperature", <span key="t" className="flex items-center gap-1"><Thermometer className="h-4 w-4 text-blue-500" />{load.temperatureC}°C</span>] as [string, React.ReactNode]] : []),
              ["Hazmat", load.hazmat ? "Yes — ADR" : "No"],
            ]} />
            {load.notes && <p className="mt-4 whitespace-pre-wrap rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{load.notes}</p>}
          </Card>

          <Card title="Timeline">
            <ActionForm action={addLoadEvent.bind(null, id)} resetOnSuccess className="mb-6">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Select name="type" className="sm:w-40" options={[{ value: "NOTE", label: "Note" }, { value: "CHECK_CALL", label: "Check call" }, { value: "ISSUE", label: "Issue" }]} />
                <Input name="message" placeholder="Add an update, check call, or issue…" required />
                <SubmitButton variant="secondary">Add</SubmitButton>
              </div>
            </ActionForm>
            <ol className="relative space-y-5 border-l border-slate-200 pl-6">
              {load.events.map((e) => (
                <li key={e.id} className="relative">
                  <span className={`absolute -left-[29px] top-1.5 h-3 w-3 rounded-full ring-4 ring-white ${EVENT_DOT[e.type] ?? "bg-slate-300"}`} />
                  <p className="text-sm text-slate-800">
                    {e.type === "ISSUE" && <b className="text-rose-600">Issue: </b>}
                    {e.type === "CHECK_CALL" && <b className="text-emerald-700">Check call: </b>}
                    {e.message}
                  </p>
                  <p className="text-xs text-slate-500">{e.user?.name ?? "System"} · {dateTime(e.createdAt)}</p>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Assignment">
            {load.truck || load.driver ? (
              <div className="mb-4 space-y-3 text-sm">
                {load.truck && <div className="flex justify-between"><span className="text-slate-500">Truck</span><Link href={`/fleet/${load.truck.id}`} className="font-medium text-blue-700 hover:underline">{load.truck.unitNumber} · {load.truck.make}</Link></div>}
                {load.trailer && <div className="flex justify-between"><span className="text-slate-500">Trailer</span><span className="font-medium">{load.trailer.unitNumber} · {EQUIPMENT_LABELS[load.trailer.type]}</span></div>}
                {load.driver && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Driver</span>
                    <span className="text-right">
                      <Link href={`/drivers/${load.driver.id}`} className="font-medium text-blue-700 hover:underline">{load.driver.name}</Link>
                      {load.driver.phone && <a href={`tel:${load.driver.phone}`} className="flex items-center justify-end gap-1 text-xs text-slate-500"><Phone className="h-3 w-3" />{load.driver.phone}</a>}
                    </span>
                  </div>
                )}
              </div>
            ) : <p className="mb-4 text-sm text-amber-700">No truck or driver assigned yet.</p>}
            {opts && (
              <ActionForm action={assignLoad.bind(null, id)} className="space-y-3 border-t border-slate-100 pt-4">
                <Field label="Truck"><Select name="truckId" required defaultValue={load.truckId ?? ""} placeholder="Select truck…"
                  options={opts.trucks.map((t) => ({ value: t.id, label: t.label + (t.note ? ` — ${t.note}` : "") }))} /></Field>
                <Field label="Driver"><Select name="driverId" required defaultValue={load.driverId ?? ""} placeholder="Select driver…"
                  options={opts.drivers.map((t) => ({ value: t.id, label: t.label + (t.note ? ` — ${t.note}` : "") }))} /></Field>
                <Field label="Trailer"><Select name="trailerId" defaultValue={load.trailerId ?? ""} placeholder="— None —"
                  options={opts.trailers.map((t) => ({ value: t.id, label: t.label + (t.note ? ` — ${t.note}` : "") }))} /></Field>
                <SubmitButton className="w-full">{load.truckId ? "Reassign" : "Assign & dispatch"}</SubmitButton>
              </ActionForm>
            )}
          </Card>

          {showMoney && (
            <Card title="Financials">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">Customer rate</span><span className="font-semibold">{money(load.rate)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Driver pay</span><span>−{money(load.driverPay)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Fuel</span><span>−{money(load.fuelCost)}</span></div>
                <div className="flex justify-between"><span className="text-slate-500">Other</span><span>−{money(load.otherCost)}</span></div>
                <div className="flex justify-between border-t border-slate-100 pt-2 font-semibold">
                  <span>Margin</span>
                  <span className={margin >= 0 ? "text-emerald-600" : "text-rose-600"}>{money(margin)} ({load.rate ? Math.round((margin / load.rate) * 100) : 0}%)</span>
                </div>
                <div className="flex justify-between text-xs text-slate-500"><span>Rate per km</span><span>${(load.rate / load.distanceKm).toFixed(2)}</span></div>
              </div>
              <div className="mt-4 border-t border-slate-100 pt-4">
                {load.invoice ? (
                  <Link href={`/finance/invoices/${load.invoice.id}`} className="flex items-center justify-between rounded-lg bg-slate-50 p-3 text-sm hover:bg-slate-100">
                    <span className="flex items-center gap-2 font-medium"><FileText className="h-4 w-4" />{load.invoice.number}</span>
                    <Badge value={load.invoice.status} />
                  </Link>
                ) : status === "DELIVERED" && can(user.role, "finance.edit") ? (
                  <form action={invoiceLoad.bind(null, id)}><button className={buttonClass("primary") + " w-full"}>Generate invoice</button></form>
                ) : status === "DELIVERED" ? (
                  <ActionForm action={setLoadStatus.bind(null, id)}>
                    <input type="hidden" name="status" value="INVOICED" />
                    <SubmitButton className="w-full">Send to billing</SubmitButton>
                  </ActionForm>
                ) : <p className="text-xs text-slate-500">Invoice becomes available after delivery.</p>}
              </div>
            </Card>
          )}

          <Card title="Customer">
            <Link href={`/customers/${load.customer.id}`} className="font-semibold text-blue-700 hover:underline">{load.customer.name}</Link>
            <p className="mt-1 text-sm text-slate-600">{load.customer.contactName}</p>
            <p className="text-sm text-slate-500">{load.customer.phone}</p>
            <p className="text-sm text-slate-500">{load.customer.email}</p>
          </Card>

          <DocumentsPanel user={user} target={{ type: "load", id }} path={`/loads/${id}`} defaultKind={status === "DELIVERED" ? "POD" : undefined} />

          {can(user.role, "users.manage") && ["PLANNED", "CANCELLED"].includes(status) && (
            <form action={deleteLoad.bind(null, id)}>
              <button className={buttonClass("ghost", "sm") + " text-rose-600"}>Delete load permanently</button>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
