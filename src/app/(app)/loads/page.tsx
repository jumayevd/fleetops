import Link from "next/link";
import { Plus, LayoutGrid, List } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { LOAD_STATUSES, LOAD_STATUS_LABELS, type LoadStatus } from "@/lib/constants";
import { money, dateTime, km, daysAgo } from "@/lib/format";
import { loadProgress } from "@/lib/telemetry";
import { Badge, Card, LinkButton, PageHeader, Table, Progress, inputClass, buttonClass } from "@/components/ui";

export const metadata = { title: "Loads & dispatch" };

const BOARD: LoadStatus[] = ["PLANNED", "ASSIGNED", "IN_TRANSIT", "DELIVERED"];

export default async function LoadsPage({ searchParams }: PageProps<"/loads">) {
  const user = await requireUser("loads.view");
  const sp = await searchParams;
  const view = sp.view === "board" ? "board" : "table";
  const status = typeof sp.status === "string" && LOAD_STATUSES.includes(sp.status as LoadStatus) ? sp.status : undefined;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const showMoney = can(user.role, "finance.view") || can(user.role, "loads.edit");

  const like = { contains: q, mode: "insensitive" as const };
  const filters: Prisma.LoadWhereInput[] = [];
  if (view === "board") filters.push({ OR: [{ status: { in: ["PLANNED", "ASSIGNED", "IN_TRANSIT"] } }, { status: "DELIVERED", deliveredAt: { gte: daysAgo(7) } }] });
  if (status && view === "table") filters.push({ status });
  if (q) filters.push({ OR: [
    { reference: like }, { originCity: like }, { destCity: like }, { commodity: like },
    { customer: { name: like } }, { driver: { name: like } }, { truck: { unitNumber: like } },
  ] });
  const where: Prisma.LoadWhereInput = { AND: filters };

  const [loads, counts] = await Promise.all([
    db.load.findMany({
      where,
      orderBy: view === "board" ? { pickupAt: "asc" } : { pickupAt: "desc" },
      take: view === "board" ? 200 : 150,
      include: { customer: { select: { name: true } }, truck: { select: { unitNumber: true } }, driver: { select: { name: true } } },
    }),
    db.load.groupBy({ by: ["status"], _count: true }),
  ]);
  const countOf = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { view, status, q: q || undefined, ...patch };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    return `/loads?${p}`;
  };

  return (
    <>
      <PageHeader
        title="Loads & dispatch"
        subtitle="Plan, assign and follow every shipment from booking to invoice."
        actions={
          <>
            <div className="flex rounded-lg bg-white p-0.5 ring-1 ring-slate-300">
              <Link href={qs({ view: "table" })} className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium ${view === "table" ? "bg-slate-900 text-white" : "text-slate-600"}`}><List className="h-3.5 w-3.5" />Table</Link>
              <Link href={qs({ view: "board", status: undefined })} className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium ${view === "board" ? "bg-slate-900 text-white" : "text-slate-600"}`}><LayoutGrid className="h-3.5 w-3.5" />Board</Link>
            </div>
            {can(user.role, "loads.edit") && <LinkButton href="/loads/new"><Plus className="h-4 w-4" />New load</LinkButton>}
          </>
        }
      />

      <form className="mb-4 flex flex-wrap gap-2" action="/loads">
        <input type="hidden" name="view" value={view} />
        {status && <input type="hidden" name="status" value={status} />}
        <input name="q" defaultValue={q} placeholder="Search reference, city, customer, driver, truck…" className={`${inputClass} max-w-md`} />
        <button className={buttonClass("secondary")}>Search</button>
      </form>

      {view === "table" ? (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <Link href={qs({ status: undefined })} className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${!status ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200"}`}>All</Link>
            {LOAD_STATUSES.map((s) => (
              <Link key={s} href={qs({ status: s })} className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${status === s ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200"}`}>
                {LOAD_STATUS_LABELS[s]} <span className="opacity-60">{countOf(s)}</span>
              </Link>
            ))}
          </div>
          <Card bodyClassName="p-0">
            <Table head={["Load", "Status", "Customer", "Route", "Pickup", "Delivery", "Truck / Driver", ...(showMoney ? ["Rate"] : [])]} empty={loads.length === 0}>
              {loads.map((l) => (
                <tr key={l.id}>
                  <td><Link href={`/loads/${l.id}`} className="font-semibold text-blue-700 hover:underline">{l.reference}</Link>
                    {l.priority !== "NORMAL" && <Badge value={l.priority} className="ml-2" />}</td>
                  <td><Badge value={l.status} label={LOAD_STATUS_LABELS[l.status as LoadStatus]} /></td>
                  <td className="max-w-44 truncate">{l.customer.name}</td>
                  <td className="whitespace-nowrap">{l.originCity} → {l.destCity}<span className="block text-xs text-slate-500">{km(l.distanceKm)} · {l.commodity}</span></td>
                  <td className="whitespace-nowrap text-slate-600">{dateTime(l.pickupAt)}</td>
                  <td className="whitespace-nowrap text-slate-600">{dateTime(l.deliveryAt)}</td>
                  <td className="whitespace-nowrap">{l.truck ? <>{l.truck.unitNumber}<span className="block text-xs text-slate-500">{l.driver?.name}</span></> : <span className="text-amber-600">Unassigned</span>}</td>
                  {showMoney && <td className="font-medium">{money(l.rate)}</td>}
                </tr>
              ))}
            </Table>
          </Card>
        </>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-4">
          {BOARD.map((col) => {
            const items = loads.filter((l) => l.status === col);
            return (
              <div key={col} className="rounded-xl bg-slate-100/80 p-3">
                <div className="mb-3 flex items-center justify-between px-1">
                  <Badge value={col} label={LOAD_STATUS_LABELS[col]} />
                  <span className="text-xs font-medium text-slate-500">{items.length}{col === "DELIVERED" && " · last 7d"}</span>
                </div>
                <div className="space-y-2">
                  {items.map((l) => (
                    <Link key={l.id} href={`/loads/${l.id}`} className="block rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:border-blue-300 hover:shadow">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold text-slate-900">{l.reference}</span>
                        {l.priority !== "NORMAL" ? <Badge value={l.priority} /> : showMoney && <span className="text-xs font-medium text-slate-600">{money(l.rate)}</span>}
                      </div>
                      <p className="mt-1 text-sm text-slate-800">{l.originCity} → {l.destCity}</p>
                      <p className="text-xs text-slate-500">{l.customer.name} · {l.commodity}</p>
                      <div className="mt-2 flex items-center justify-between text-xs">
                        <span className="text-slate-500">{col === "DELIVERED" ? `✓ ${dateTime(l.deliveredAt)}` : `⏱ ${dateTime(col === "IN_TRANSIT" ? l.deliveryAt : l.pickupAt)}`}</span>
                        <span className={l.truck ? "text-slate-600" : "font-medium text-amber-600"}>{l.truck ? `${l.truck.unitNumber} · ${l.driver?.name.split(" ")[0]}` : "Needs truck"}</span>
                      </div>
                      {col === "IN_TRANSIT" && <Progress value={loadProgress(l)} className="mt-2" />}
                    </Link>
                  ))}
                  {items.length === 0 && <p className="py-6 text-center text-xs text-slate-400">Empty</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
