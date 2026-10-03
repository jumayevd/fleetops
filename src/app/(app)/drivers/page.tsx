import Link from "next/link";
import { Plus, Users, CheckCircle2, Route, PauseCircle, ShieldAlert } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { BOARD_STATUS_LABELS, DRIVER_STATUSES, DRIVER_TYPES, DRIVER_TYPE_LABELS, DRIVER_TYPE_SHORT, type BoardStatus } from "@/lib/constants";
import { daysAgo, daysUntil, money, number } from "@/lib/format";
import { Badge, Card, Cell, Chip, EmptyState, ExpiryBadge, LinkButton, PageHeader, Stat, Table } from "@/components/ui";
import { DriverFilters } from "./filters";
import { LinkRow } from "./link-row";
import { TeamControl } from "./team-control";
import { ACTIVE_LOAD_STATUSES, COMPLETED_LOAD_STATUSES, DRIVER_TYPE_TONE, EMPLOYMENT_LABELS, ON_TRIP_STATUSES, atRisk, scoreGrade, sinceShort } from "./shared";

export const metadata = { title: "Drivers" };

const str = (v: string | string[] | undefined) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const oneOf = (list: readonly string[], v: string | undefined) => (v && list.includes(v) ? v : undefined);

export default async function DriversPage({ searchParams }: PageProps<"/drivers">) {
  const user = await requireUser("drivers.view");
  const editable = can(user.role, "drivers.edit");
  const sp = await searchParams;
  const team = str(sp.team);
  const type = oneOf(DRIVER_TYPES, str(sp.type));
  const status = oneOf(DRIVER_STATUSES, str(sp.status));
  const risk = str(sp.risk) === "1" ? "1" : undefined;
  const inactive = str(sp.inactive) === "1" ? "1" : undefined;
  const hold = str(sp.hold) === "1" ? "1" : undefined;
  const q = str(sp.q);
  const params = { team, type, status, risk, inactive, hold, q };

  const [all, teams, recent, activeLoads] = await Promise.all([
    db.driver.findMany({
      orderBy: { name: "asc" },
      include: { team: { select: { id: true, name: true, color: true } }, truck: { select: { id: true, unitNumber: true } }, user: { select: { id: true, lastLoginAt: true } } },
    }),
    db.team.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true, color: true } }),
    db.load.groupBy({
      by: ["driverId"],
      where: { status: { in: [...COMPLETED_LOAD_STATUSES] }, deliveredAt: { gte: daysAgo(30) }, driverId: { not: null } },
      _sum: { distanceKm: true, rate: true }, _count: true,
    }),
    db.load.findMany({
      where: { status: { in: [...ACTIVE_LOAD_STATUSES] }, driverId: { not: null } }, orderBy: { status: "desc" },
      select: { id: true, reference: true, driverId: true, destCity: true },
    }),
  ]);
  const recentFor = new Map(recent.map((r) => [r.driverId, r]));
  const loadFor = new Map<string, (typeof activeLoads)[number]>();
  for (const l of activeLoads) if (l.driverId && !loadFor.has(l.driverId)) loadFor.set(l.driverId, l);

  // Roster KPIs are fleet-wide (not affected by the filters).
  const working = all.filter((d) => d.status !== "INACTIVE");
  const activeCount = all.filter((d) => d.status === "ACTIVE").length;
  const onLeave = all.filter((d) => d.status === "ON_LEAVE").length;
  const inactiveCount = all.length - working.length;
  const ready = all.filter((d) => d.status === "ACTIVE" && d.boardStatus === "READY" && !d.hold).length;
  const onTrips = working.filter((d) => (ON_TRIP_STATUSES as readonly string[]).includes(d.boardStatus)).length;
  const enRoute = working.filter((d) => d.boardStatus === "EN_ROUTE").length;
  const holds = working.filter((d) => d.hold).length;
  const risky = working.filter(atRisk).length;
  const expiring = working.filter((d) => {
    const l = daysUntil(d.licenseExpiry);
    const m = daysUntil(d.medicalExpiry);
    return (l != null && l <= 30) || (m != null && m <= 30);
  }).length;
  const noLogin = working.filter((d) => !d.user).length;

  const needle = q?.toLowerCase();
  const drivers = all.filter((d) => {
    if (status ? d.status !== status : !inactive && d.status === "INACTIVE") return false;
    if (team === "none" ? d.teamId !== null : team && d.teamId !== team) return false;
    if (type && d.type !== type) return false;
    if (risk && !atRisk(d)) return false;
    if (hold && !d.hold) return false;
    if (needle) {
      const hay = [d.name, d.phone, d.phone2, d.email, d.licenseNumber, d.truck?.unitNumber, d.team?.name].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });

  const qs = (patch: Partial<typeof params>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...params, ...patch })) if (v) p.set(k, v);
    const s = p.toString();
    return `/drivers${s ? `?${s}` : ""}`;
  };
  const filtered = Object.values(params).some(Boolean);
  const tile = (href: string | null, node: React.ReactNode) =>
    href ? <Link href={href} className="group block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">{node}</Link> : node;
  const tileClass = "h-full transition-colors group-hover:border-line-strong";

  return (
    <>
      <PageHeader
        eyebrow="People & partners"
        title="Drivers"
        subtitle={`${working.length} on the roster · ${ready} ready · ${onTrips} on trips right now`}
        actions={editable && <LinkButton href="/drivers/new"><Plus />Add driver</LinkButton>}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {tile(filtered ? "/drivers" : qs({ status: "ACTIVE" }), <Stat className={tileClass} label="Active drivers" value={activeCount} hint={`${onLeave} on leave · ${inactiveCount} inactive`} icon={<Users />} />)}
        <Stat className={tileClass} label="Ready" value={ready} hint="available for dispatch" tone={ready ? "ok" : "neutral"} icon={<CheckCircle2 />} />
        <Stat className={tileClass} label="On trips" value={onTrips} hint={`${enRoute} en route · ${onTrips - enRoute} dispatched or at a stop`} tone="progress" icon={<Route />} />
        {tile(qs({ hold: "1", status: undefined }), <Stat className={tileClass} label="On hold" value={holds} hint={holds ? "excluded from dispatch" : "nobody is held back"} tone={holds ? "warn" : "neutral"} icon={<PauseCircle />} />)}
        {tile(qs({ risk: "1", status: undefined }), <Stat className={tileClass} label="At risk" value={risky} hint={risky ? `${expiring} with papers expiring within 30d` : "scores and papers are fine"} tone={risky ? "danger" : "ok"} icon={<ShieldAlert />} />)}
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <DriverFilters params={params}
          teams={teams.map((t) => ({ value: t.id, label: t.name }))}
          types={DRIVER_TYPES.map((t) => ({ value: t, label: DRIVER_TYPE_LABELS[t] }))}
          statuses={DRIVER_STATUSES.map((s) => ({ value: s, label: EMPLOYMENT_LABELS[s] }))} />
        <p className="text-[11px] text-fg-subtle">
          Showing <span className="num">{drivers.length}</span> of <span className="num">{all.length}</span>
          {!inactive && !status && inactiveCount > 0 && <> · {inactiveCount} inactive hidden</>}
        </p>
      </div>

      <Card flush>
        <Table head={["Driver", "Score", "Status", "Team", "Truck", "Phone", "30d loads", "30d km", "30d revenue", "Licence", "Medical", "App login"]}>
          {drivers.map((d) => {
            const r = recentFor.get(d.id);
            const l = loadFor.get(d.id);
            const g = scoreGrade(d.score);
            const risks = atRisk(d);
            return (
              <LinkRow key={d.id} href={`/drivers/${d.id}`}>
                <td className="min-w-48">
                  <div className="flex items-center gap-1.5">
                    <Link href={`/drivers/${d.id}`} className="truncate font-medium text-fg hover:underline">{d.name}</Link>
                    <Chip tone={DRIVER_TYPE_TONE[d.type]} title={DRIVER_TYPE_LABELS[d.type]}>{DRIVER_TYPE_SHORT[d.type] ?? d.type}</Chip>
                    {d.hold && <Chip tone="warn" title={d.holdReason ?? "On hold"}>Hold</Chip>}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-fg-subtle">
                    {d.status !== "ACTIVE" ? <Badge value={d.status} label={EMPLOYMENT_LABELS[d.status] ?? d.status} /> : d.email ?? DRIVER_TYPE_LABELS[d.type]}
                  </div>
                </td>
                <td>
                  <span className="inline-flex items-center gap-1.5">
                    <Badge value={g.grade} tone={g.tone} label={`${g.grade} · ${d.score}`} className="num" />
                    {risks && <ShieldAlert className="h-3.5 w-3.5 text-danger" aria-label="At risk" />}
                  </span>
                </td>
                <td>
                  <div className="flex items-center gap-1.5">
                    <Badge value={d.boardStatus} label={BOARD_STATUS_LABELS[d.boardStatus as BoardStatus] ?? d.boardStatus} dot />
                    <span className="num text-[11px] text-fg-subtle" title="Time in this status">{sinceShort(d.boardStatusSince)}</span>
                  </div>
                  {l && <div className="mt-0.5 text-[11px] text-fg-subtle"><Link href={`/loads/${l.id}`} className="num hover:underline">{l.reference}</Link> → {l.destCity}</div>}
                </td>
                <td><TeamControl driverId={d.id} teamId={d.teamId} teams={teams} editable={editable} /></td>
                <td>{d.truck ? <Link href={`/fleet/${d.truck.id}`} className="num hover:underline">{d.truck.unitNumber}</Link> : <span className="text-fg-faint">—</span>}</td>
                <td>
                  {d.phone ? <Cell mono primary={<a href={`tel:${d.phone}`} className="hover:underline">{d.phone}</a>} secondary={d.phone2} /> : <span className="text-fg-faint">—</span>}
                </td>
                <td className="num">{r?._count ?? 0}</td>
                <td className="num text-fg-muted">{number(r?._sum.distanceKm)}</td>
                <td className="num">{r ? money(r._sum.rate) : <span className="text-fg-faint">—</span>}</td>
                <td><ExpiryBadge days={daysUntil(d.licenseExpiry)} /></td>
                <td><ExpiryBadge days={daysUntil(d.medicalExpiry)} /></td>
                <td>{d.user ? <Badge value="ACTIVE" label="Enabled" /> : <span className="text-fg-faint">—</span>}</td>
              </LinkRow>
            );
          })}
        </Table>
        {drivers.length === 0 && (
          all.length === 0
            ? <EmptyState title="No drivers yet" description="Add your first driver to start dispatching loads." action={editable && <LinkButton href="/drivers/new"><Plus />Add driver</LinkButton>} />
            : <EmptyState title="No drivers match" description="Try another team, type or status, or clear the search." action={<LinkButton href="/drivers" variant="secondary">Clear filters</LinkButton>} />
        )}
      </Card>
      {drivers.length > 0 && (
        <p className="mt-2 text-[11px] text-fg-subtle">
          Score grades: A from 90 · B from 80 · C from 70 · D below. At risk = score under 75, or licence / medical expired or expiring within 30 days.
          30-day figures count delivered loads by delivery date.{noLogin > 0 && <> · <span className="num">{noLogin}</span> drivers have no app login</>}
        </p>
      )}
    </>
  );
}
