import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Plus, Truck as TruckIcon, Activity, Wrench, TriangleAlert, Timer, FileCheck, Container, X } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { OWNERSHIP, OWNERSHIP_LABELS, TRUCK_STATUSES } from "@/lib/constants";
import { REQUIRED_UNIT_DOCS } from "@/lib/documents";
import { km, number, ago, daysUntil } from "@/lib/format";
import { loadProgress, syncSimulatedPositions } from "@/lib/telemetry";
import { Badge, Card, Cell, Chip, EmptyState, ExpiryBadge, FilterPills, LinkButton, PageHeader, Progress, Segmented, Stat, Table, cn } from "@/components/ui";
import { ListFilters } from "./filters";
import { LinkRow } from "./link-row";
import { docsByUnit, fuelTone, missingDocs, OWNERSHIP_SHORT, OWNERSHIP_TONE, pmStatus, TRUCK_STATUS_LABELS } from "./lib";

export const metadata = { title: "Trucks" };

const str = (v: string | string[] | undefined) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

export default async function FleetPage({ searchParams }: PageProps<"/fleet">) {
  const user = await requireUser("fleet.view");
  const editable = can(user.role, "fleet.edit");
  const sp = await searchParams;
  const status = TRUCK_STATUSES.includes(str(sp.status) as never) ? str(sp.status) : undefined;
  const ownership = OWNERSHIP.includes(str(sp.ownership) as never) ? str(sp.ownership) : undefined;
  const group = str(sp.group);
  const q = str(sp.q);
  const pm = str(sp.pm) === "overdue" || str(sp.pm) === "due" ? str(sp.pm) : undefined;
  const docsFilter = str(sp.docs) === "incomplete" ? "incomplete" : undefined;
  const params = { status, ownership, group, q, pm, docs: docsFilter };

  await syncSimulatedPositions();

  const like = { contains: q ?? "", mode: "insensitive" as const };
  const where: Prisma.TruckWhereInput = {
    AND: [
      status ? { status } : {},
      ownership ? { ownership } : {},
      group ? { group } : {},
      q ? { OR: [{ unitNumber: like }, { plate: like }, { make: like }, { model: like }, { vin: like }, { locationName: like }, { driver: { name: like } }] } : {},
    ],
  };

  const [rows, all, docRows, trailerCount, onLoad] = await Promise.all([
    db.truck.findMany({
      where, orderBy: { unitNumber: "asc" },
      include: {
        driver: { select: { id: true, name: true, hold: true } },
        loads: {
          where: { status: { in: ["ASSIGNED", "IN_TRANSIT"] } }, orderBy: { pickupAt: "asc" }, take: 1,
          select: { id: true, reference: true, status: true, originCity: true, destCity: true, departedAt: true, distanceKm: true },
        },
      },
    }),
    db.truck.findMany({ select: { id: true, status: true, ownership: true, group: true, odometerKm: true, pmIntervalKm: true, lastPmKm: true, nextServiceKm: true } }),
    db.document.findMany({ where: { truckId: { not: null }, kind: { in: [...REQUIRED_UNIT_DOCS] } }, select: { truckId: true, kind: true } }),
    db.trailer.count(),
    db.load.count({ where: { status: { in: ["ASSIGNED", "IN_TRANSIT"] }, truckId: { not: null } } }),
  ]);

  const docs = docsByUnit(docRows.map((d) => ({ id: d.truckId, kind: d.kind })));
  const missingFor = (id: string) => missingDocs(docs.get(id), REQUIRED_UNIT_DOCS);

  // Fleet-wide KPIs (independent of the current filters).
  const byStatus = (s: string) => all.filter((t) => t.status === s).length;
  const pmAll = all.map((t) => pmStatus(t));
  const pmOverdue = pmAll.filter((p) => p.state === "overdue").length;
  const pmDue = pmAll.filter((p) => p.state === "due").length;
  const ownerOps = all.filter((t) => t.ownership === "OWNER_OPERATOR").length;
  const leased = all.filter((t) => t.ownership === "LEASED").length;
  const incomplete = all.filter((t) => missingFor(t.id).length > 0).length;
  const nothingOnFile = all.filter((t) => missingFor(t.id).length === REQUIRED_UNIT_DOCS.length).length;
  const groups = [...new Set(all.map((t) => t.group).filter((g): g is string => Boolean(g)))].sort();

  // Post-filters that depend on computed state (PM, paperwork).
  const trucks = rows.filter((t) => {
    if (pm && pmStatus(t).state !== pm) return false;
    if (docsFilter && missingFor(t.id).length === 0) return false;
    return true;
  });

  const qs = (patch: Partial<typeof params>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...params, ...patch })) if (v) p.set(k, v);
    const s = p.toString();
    return `/fleet${s ? `?${s}` : ""}`;
  };
  const filtered = Boolean(status || ownership || group || q || pm || docsFilter);
  const tile = (href: string | null, node: React.ReactNode) =>
    href ? <Link href={href} className="group block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">{node}</Link> : node;
  const tileClass = "h-full transition-colors group-hover:border-line-strong";

  return (
    <>
      <PageHeader
        eyebrow="Fleet"
        title="Trucks"
        subtitle={`${all.length} tractors · ${byStatus("ACTIVE")} active · ${onLoad} on a load right now`}
        actions={
          <>
            <Segmented active="trucks" items={[
              { key: "trucks", label: <span className="inline-flex items-center gap-1"><TruckIcon className="h-3.5 w-3.5" />Trucks</span>, href: "/fleet", count: all.length },
              { key: "trailers", label: <span className="inline-flex items-center gap-1"><Container className="h-3.5 w-3.5" />Trailers</span>, href: "/fleet/trailers", count: trailerCount },
            ]} />
            {editable && <LinkButton href="/fleet/new"><Plus />Add truck</LinkButton>}
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        {tile(filtered ? "/fleet" : null, <Stat className={tileClass} label="Trucks" value={all.length} hint={`${trailerCount} trailers`} icon={<TruckIcon />} />)}
        {tile(qs({ status: "ACTIVE", pm: undefined, docs: undefined }), <Stat className={tileClass} label="Active" value={byStatus("ACTIVE")} hint={`${onLoad} on a load`} tone="ok" icon={<Activity />} />)}
        {tile(qs({ status: "MAINTENANCE", pm: undefined, docs: undefined }), <Stat className={tileClass} label="In shop" value={byStatus("MAINTENANCE")} hint={`${byStatus("OUT_OF_SERVICE")} out of service`} tone={byStatus("MAINTENANCE") ? "warn" : "neutral"} icon={<Wrench />} />)}
        {tile(qs({ pm: "overdue", status: undefined }), <Stat className={tileClass} label="PM overdue" value={pmOverdue} hint="service past due" tone={pmOverdue ? "danger" : "neutral"} icon={<TriangleAlert />} />)}
        {tile(qs({ pm: "due", status: undefined }), <Stat className={tileClass} label="PM due < 2,000 km" value={pmDue} hint="book a slot" tone={pmDue ? "warn" : "neutral"} icon={<Timer />} />)}
        <Stat className={tileClass} label="Non-company" value={ownerOps + leased} hint={`${ownerOps} owner-op · ${leased} leased`} tone="info" />
        {tile(qs({ docs: "incomplete", status: undefined }), <Stat className={tileClass} label="Paperwork incomplete" value={incomplete} hint={nothingOnFile ? `${nothingOnFile} with nothing on file` : "registration, insurance, inspection"} tone={incomplete ? "warn" : "ok"} icon={<FileCheck />} />)}
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <FilterPills active={status ?? "all"} items={[
            { key: "all", label: "All", href: qs({ status: undefined }), count: all.length },
            ...TRUCK_STATUSES.map((s) => ({ key: s, label: TRUCK_STATUS_LABELS[s], href: qs({ status: s }), count: byStatus(s) })),
          ]} />
          {pm && <Link href={qs({ pm: undefined })} className="inline-flex h-6 items-center gap-1 rounded-full bg-accent-soft px-2.5 text-[12px] font-medium text-accent-text hover:opacity-80">{pm === "overdue" ? "PM overdue" : "PM due soon"}<X className="h-3 w-3" /></Link>}
          {docsFilter && <Link href={qs({ docs: undefined })} className="inline-flex h-6 items-center gap-1 rounded-full bg-accent-soft px-2.5 text-[12px] font-medium text-accent-text hover:opacity-80">Paperwork incomplete<X className="h-3 w-3" /></Link>}
        </div>
        <ListFilters basePath="/fleet" params={params} placeholder="Unit, plate, VIN, driver, city…" selects={[
          { name: "ownership", placeholder: "All ownership", options: OWNERSHIP.map((o) => ({ value: o, label: OWNERSHIP_LABELS[o] })) },
          ...(groups.length ? [{ name: "group", placeholder: "All groups", options: groups.map((g) => ({ value: g, label: g })) }] : []),
        ]} />
      </div>

      <Card flush>
        <Table head={["Unit", "Vehicle", "Status", "Ownership", "Driver", "Current load", "Location", "Odometer", "PM", "Insurance", "Inspection", "Registration", "Fuel"]}>
          {trucks.map((t) => {
            const l = t.loads[0];
            const p = pmStatus(t);
            const missing = missingFor(t.id);
            const progress = l?.status === "IN_TRANSIT" ? loadProgress(l) : null;
            return (
              <LinkRow key={t.id} href={`/fleet/${t.id}`}>
                <td>
                  <Cell mono primary={<Link href={`/fleet/${t.id}`} className="font-semibold hover:underline">{t.unitNumber}</Link>} secondary={t.plate} />
                </td>
                <td><Cell primary={`${t.make} ${t.model}`} secondary={<span className="num">{t.year}{t.group ? ` · ${t.group}` : ""}</span>} /></td>
                <td><Badge value={t.status} label={TRUCK_STATUS_LABELS[t.status]} dot /></td>
                <td><Chip tone={OWNERSHIP_TONE[t.ownership]} className="normal-case tracking-normal">{OWNERSHIP_SHORT[t.ownership] ?? t.ownership}</Chip></td>
                <td>
                  {t.driver
                    ? <span className="inline-flex items-center gap-1.5"><Link href={`/drivers/${t.driver.id}`} className="hover:underline">{t.driver.name}</Link>{t.driver.hold && <Chip tone="warn">Hold</Chip>}</span>
                    : <span className="text-fg-faint">Unassigned</span>}
                </td>
                <td className="min-w-40">
                  {l ? (
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5"><Link href={`/loads/${l.id}`} className="num font-medium hover:underline">{l.reference}</Link><Badge value={l.status} label={l.status === "IN_TRANSIT" ? "In transit" : "Dispatched"} /></div>
                      <div className="mt-0.5 flex items-center gap-2 text-[11px] text-fg-subtle"><span className="truncate">{l.originCity} → {l.destCity}</span>{progress != null && <Progress value={progress} className="w-14" />}</div>
                    </div>
                  ) : <span className={t.status === "ACTIVE" ? "text-fg-muted" : "text-fg-faint"}>{t.status === "ACTIVE" ? "Idle" : "—"}</span>}
                </td>
                <td><Cell primary={t.locationName ?? <span className="text-fg-faint">Unknown</span>} secondary={t.lastPingAt ? ago(t.lastPingAt) : "no ping"} /></td>
                <td className="num whitespace-nowrap text-fg-muted">{km(t.odometerKm)}</td>
                <td className="whitespace-nowrap">
                  {p.left == null ? <span className="text-fg-faint" title="No PM data">—</span>
                    : p.state === "overdue" ? <Badge value="OVERDUE" label={`${number(-p.left)} km over`} />
                    : p.state === "due" ? <Badge value="HIGH" label={`${number(p.left)} km left`} />
                    : <span className="num text-fg-muted">{number(p.left)} km</span>}
                </td>
                <td><ExpiryBadge days={daysUntil(t.insuranceExpiry)} /></td>
                <td><ExpiryBadge days={daysUntil(t.inspectionExpiry)} /></td>
                <td>
                  <span className="inline-flex items-center gap-1.5">
                    <ExpiryBadge days={daysUntil(t.registrationExpiry)} />
                    {missing.length > 0 && <Chip tone="warn" title={`Missing ${missing.map((m) => m.toLowerCase()).join(", ")}`}>{missing.length} doc{missing.length > 1 ? "s" : ""}</Chip>}
                  </span>
                </td>
                <td>
                  {t.fuelPct == null ? <span className="text-fg-faint">—</span> : (
                    <span className="inline-flex items-center gap-2">
                      <Progress value={t.fuelPct / 100} tone={fuelTone(t.fuelPct)} className="w-12" />
                      <span className={cn("num text-[12px]", t.fuelPct < 15 ? "text-danger" : "text-fg-muted")}>{Math.round(t.fuelPct)}%</span>
                    </span>
                  )}
                </td>
              </LinkRow>
            );
          })}
        </Table>
        {trucks.length === 0 && (
          all.length === 0
            ? <EmptyState title="No trucks yet" description="Add your first tractor to start assigning loads and tracking service." action={editable && <LinkButton href="/fleet/new"><Plus />Add truck</LinkButton>} />
            : <EmptyState title="No trucks match" description="Try another status, ownership or group, or clear the search." action={<LinkButton href="/fleet" variant="secondary">Clear filters</LinkButton>} />
        )}
      </Card>
      {trucks.length > 0 && (
        <p className="mt-2 text-[11px] text-fg-subtle">
          Showing <span className="num">{trucks.length}</span> of <span className="num">{all.length}</span> trucks · PM from next service km or last PM + interval · positions refresh every 10 s.
        </p>
      )}
    </>
  );
}
