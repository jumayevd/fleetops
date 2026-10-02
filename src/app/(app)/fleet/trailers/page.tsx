import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Plus, Truck as TruckIcon, Container, FileCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { EQUIPMENT, EQUIPMENT_LABELS, TRAILER_STATUSES, TRAILER_STATUS_LABELS } from "@/lib/constants";
import { REQUIRED_UNIT_DOCS } from "@/lib/documents";
import { kg, ago, daysUntil } from "@/lib/format";
import { syncSimulatedPositions } from "@/lib/telemetry";
import { Badge, Card, Cell, EmptyState, ExpiryBadge, FilterPills, LinkButton, PageHeader, Segmented, STATUS_TONE, Stat, Table, cn } from "@/components/ui";
import { ListFilters } from "../filters";
import { LinkRow } from "../link-row";
import { docsByUnit, missingDocs, sinceShort } from "../lib";
import { TrailerStatusControl } from "./status-control";
import { TrailerRowMenu } from "./row-menu";

export const metadata = { title: "Trailers" };

const str = (v: string | string[] | undefined) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const DAY = 86_400_000;

export default async function TrailersPage({ searchParams }: PageProps<"/fleet/trailers">) {
  const user = await requireUser("fleet.view");
  const editable = can(user.role, "fleet.edit");
  const sp = await searchParams;
  const status = TRAILER_STATUSES.includes(str(sp.status) as never) ? str(sp.status) : undefined;
  const type = EQUIPMENT.includes(str(sp.type) as never) ? str(sp.type) : undefined;
  const q = str(sp.q);
  const docsFilter = str(sp.docs) === "incomplete" ? "incomplete" : undefined;
  const params = { status, type, q, docs: docsFilter };

  await syncSimulatedPositions();

  const like = { contains: q ?? "", mode: "insensitive" as const };
  const where: Prisma.TrailerWhereInput = {
    AND: [
      status ? { status } : {},
      type ? { type } : {},
      q ? { OR: [{ unitNumber: like }, { plate: like }, { locationName: like }, { gpsProvider: like }, { truck: { unitNumber: like } }, { truck: { driver: { name: like } } }] } : {},
    ],
  };

  const [rows, all, docRows, truckCount] = await Promise.all([
    db.trailer.findMany({
      where, orderBy: { unitNumber: "asc" },
      include: {
        truck: { select: { id: true, unitNumber: true, driver: { select: { id: true, name: true } } } },
        loads: { where: { status: { in: ["ASSIGNED", "IN_TRANSIT"] } }, take: 1, select: { id: true, reference: true } },
      },
    }),
    db.trailer.findMany({ select: { id: true, unitNumber: true, status: true, statusSince: true, truckId: true } }),
    db.document.findMany({ where: { trailerId: { not: null }, kind: { in: [...REQUIRED_UNIT_DOCS] } }, select: { trailerId: true, kind: true } }),
    db.truck.count(),
  ]);

  const docs = docsByUnit(docRows.map((d) => ({ id: d.trailerId, kind: d.kind })));
  const missingFor = (id: string) => missingDocs(docs.get(id), REQUIRED_UNIT_DOCS);
  const trailers = docsFilter ? rows.filter((t) => missingFor(t.id).length > 0) : rows;

  const byStatus = (s: string) => all.filter((t) => t.status === s);
  const oldest = (s: string) => byStatus(s).sort((a, b) => a.statusSince.getTime() - b.statusSince.getTime())[0];
  const days = (d: Date) => Math.floor((Date.now() - d.getTime()) / DAY);
  const incomplete = all.filter((t) => missingFor(t.id).length > 0).length;
  const shopOldest = oldest("SHOP");
  const dropOldest = oldest("DROPPED");
  const paired = all.filter((t) => t.truckId).length;

  const qs = (patch: Partial<typeof params>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...params, ...patch })) if (v) p.set(k, v);
    const s = p.toString();
    return `/fleet/trailers${s ? `?${s}` : ""}`;
  };
  const tile = (href: string, node: React.ReactNode) => <Link href={href} className="group block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">{node}</Link>;
  const tileClass = "h-full transition-colors group-hover:border-line-strong";
  const statusTile = (s: string, hint?: string) => tile(qs({ status: s, docs: undefined }),
    <Stat className={tileClass} label={TRAILER_STATUS_LABELS[s]} value={byStatus(s).length} hint={hint} tone={byStatus(s).length ? STATUS_TONE[s] : "neutral"} />);

  return (
    <>
      <PageHeader
        eyebrow="Fleet"
        title="Trailers"
        subtitle={`${all.length} trailers · ${byStatus("IN_USE").length} in use · ${paired} paired with a tractor`}
        actions={
          <>
            <Segmented active="trailers" items={[
              { key: "trucks", label: <span className="inline-flex items-center gap-1"><TruckIcon className="h-3.5 w-3.5" />Trucks</span>, href: "/fleet", count: truckCount },
              { key: "trailers", label: <span className="inline-flex items-center gap-1"><Container className="h-3.5 w-3.5" />Trailers</span>, href: "/fleet/trailers", count: all.length },
            ]} />
            {editable && <LinkButton href="/fleet/trailers/new"><Plus />Add trailer</LinkButton>}
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
        {tile(status || docsFilter || type || q ? "/fleet/trailers" : qs({}), <Stat className={tileClass} label="Trailers" value={all.length} hint={`${truckCount} tractors`} icon={<Container />} />)}
        {statusTile("IN_USE", "on a load")}
        {statusTile("EMPTY", "ready to pair")}
        {statusTile("DROPPED", dropOldest ? `oldest ${days(dropOldest.statusSince)}d · ${dropOldest.unitNumber}` : "at customer sites")}
        {statusTile("YARD", "parked, available")}
        {statusTile("SHOP", shopOldest ? `${shopOldest.unitNumber} in ${days(shopOldest.statusSince)}d` : "none in repair")}
        {statusTile("OUT_OF_SERVICE", "needs decision")}
        {tile(qs({ docs: "incomplete", status: undefined }), <Stat className={tileClass} label="Docs incomplete" value={incomplete} hint="registration, insurance, inspection" tone={incomplete ? "warn" : "ok"} icon={<FileCheck />} />)}
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <FilterPills active={status ?? "all"} items={[
            { key: "all", label: "All", href: qs({ status: undefined }), count: all.length },
            ...TRAILER_STATUSES.map((s) => ({ key: s, label: TRAILER_STATUS_LABELS[s], href: qs({ status: s }), count: byStatus(s).length })),
          ]} />
          {docsFilter && <Link href={qs({ docs: undefined })} className="inline-flex h-6 items-center gap-1 rounded-full bg-accent-soft px-2.5 text-[12px] font-medium text-accent-text hover:opacity-80">Docs incomplete ×</Link>}
        </div>
        <ListFilters basePath="/fleet/trailers" params={params} placeholder="Unit, plate, truck, driver, place…" selects={[
          { name: "type", placeholder: "All types", options: EQUIPMENT.map((e) => ({ value: e, label: EQUIPMENT_LABELS[e] })) },
        ]} />
      </div>

      <Card flush>
        <Table head={["Unit", "Status", "Paired truck", "Driver", "Location", "GPS", "Capacity", "Inspection", "Insurance", "Documents", ""]}>
          {trailers.map((t) => {
            const missing = missingFor(t.id);
            const onFile = REQUIRED_UNIT_DOCS.length - missing.length;
            const load = t.loads[0];
            return (
              <LinkRow key={t.id} href={`/fleet/trailers/${t.id}`}>
                <td>
                  <Cell mono primary={<Link href={`/fleet/trailers/${t.id}`} className="font-semibold hover:underline">{t.unitNumber}</Link>}
                    secondary={<span>{EQUIPMENT_LABELS[t.type] ?? t.type}{t.year ? <span className="num"> · {t.year}</span> : ""}{t.plate ? <span className="num"> · {t.plate}</span> : ""}</span>} />
                </td>
                <td className="whitespace-nowrap"><TrailerStatusControl id={t.id} status={t.status} locationName={t.locationName} editable={editable} since={sinceShort(t.statusSince)} /></td>
                <td>
                  {t.truck ? (
                    <Cell mono primary={<Link href={`/fleet/${t.truck.id}`} className="font-medium hover:underline">{t.truck.unitNumber}</Link>}
                      secondary={load ? <Link href={`/loads/${load.id}`} className="hover:underline">{load.reference}</Link> : undefined} />
                  ) : <span className="text-fg-faint">—</span>}
                </td>
                <td>{t.truck?.driver ? <Link href={`/drivers/${t.truck.driver.id}`} className="hover:underline">{t.truck.driver.name}</Link> : <span className="text-fg-faint">—</span>}</td>
                <td><Cell primary={t.locationName ?? <span className="text-fg-faint">Unknown</span>} secondary={t.lastPingAt ? ago(t.lastPingAt) : t.gpsProvider ? "no ping yet" : "no tracker"} /></td>
                <td className="whitespace-nowrap">{t.gpsProvider ?? <span className="text-fg-faint">None</span>}</td>
                <td className="num whitespace-nowrap text-fg-muted">{kg(t.capacityKg)}</td>
                <td><ExpiryBadge days={daysUntil(t.inspectionExpiry)} /></td>
                <td><ExpiryBadge days={daysUntil(t.insuranceExpiry)} /></td>
                <td>
                  <Badge value="DOCS" tone={onFile === REQUIRED_UNIT_DOCS.length ? "ok" : onFile === 0 ? "neutral" : "warn"} label={`${onFile}/${REQUIRED_UNIT_DOCS.length}`}
                    className={cn("num", onFile === 0 && "text-fg-subtle")} />
                </td>
                <td className="text-right"><TrailerRowMenu id={t.id} truckId={t.truckId} editable={editable} /></td>
              </LinkRow>
            );
          })}
        </Table>
        {trailers.length === 0 && (
          all.length === 0
            ? <EmptyState title="No trailers yet" description="Add your trailers to pair them with tractors and track where each one is." action={editable && <LinkButton href="/fleet/trailers/new"><Plus />Add trailer</LinkButton>} />
            : <EmptyState title="No trailers match" description="Try another status or type, or clear the search." action={<LinkButton href="/fleet/trailers" variant="secondary">Clear filters</LinkButton>} />
        )}
      </Card>
      {trailers.length > 0 && (
        <p className="mt-2 text-[11px] text-fg-subtle">
          Showing <span className="num">{trailers.length}</span> of <span className="num">{all.length}</span> · the small number next to a status is time in that status{editable ? " · click a status to change it" : ""}.
        </p>
      )}
    </>
  );
}
