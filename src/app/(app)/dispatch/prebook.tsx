import Link from "next/link";
import { Info } from "lucide-react";
import type { prebookLoads } from "./board-data";
import { LOAD_STATUS_LABELS, DRIVER_TYPE_SHORT, type LoadStatus } from "@/lib/constants";
import { dateTime, ago, money, number } from "@/lib/format";
import { Badge, Card, Chip, EmptyState, LinkButton, Stat, Table } from "@/components/ui";

type PrebookLoad = Awaited<ReturnType<typeof prebookLoads>>[number];
type Team = { id: string; name: string; color: string | null };

const DAY = 86_400_000;

/** Prebook: booked / dispatched loads with a pickup more than 24 h away, grouped by team. */
export function PrebookView({ loads, teams, canAssign, showMoney }: { loads: PrebookLoad[]; teams: Team[]; canAssign: boolean; showMoney: boolean }) {
  const now = Date.now();
  const unassigned = loads.filter((l) => !l.driverId);
  const soon = loads.filter((l) => l.pickupAt.getTime() - now < 2 * DAY);
  const groups: { key: string; name: string; color: string | null; loads: PrebookLoad[] }[] = [
    ...teams.map((t) => ({ key: t.id, name: t.name, color: t.color, loads: loads.filter((l) => l.teamId === t.id) })),
    { key: "none", name: "No team yet", color: null, loads: loads.filter((l) => !l.teamId || !teams.some((t) => t.id === l.teamId)) },
  ].filter((g) => g.loads.length);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Prebooked" value={loads.length} hint="pickup more than 24 h out" />
        <Stat label="Need a driver" value={unassigned.length} tone={unassigned.length ? "warn" : "ok"} hint={unassigned.length ? "assign from the load page" : "everything is covered"} />
        <Stat label="Pickups within 48 h" value={soon.length} tone="info" hint="move to the daily board soon" />
        {showMoney ? <Stat label="Booked revenue" value={money(loads.reduce((a, l) => a + l.rate, 0))} hint={`${number(loads.reduce((a, l) => a + l.distanceKm, 0))} km planned`} /> : <Stat label="Planned km" value={number(loads.reduce((a, l) => a + l.distanceKm, 0))} />}
      </div>

      <p className="flex items-start gap-2 rounded-md border border-line bg-surface px-3 py-2 text-[12px] text-fg-muted">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-fg-subtle" />
        <span>Only loads whose pickup is more than 24 hours away are listed. Assigning a driver here reserves them without occupying them on today's board — once the pickup is inside 24 hours the load appears on the daily board automatically.</span>
      </p>

      {groups.length === 0 && (
        <Card>
          <EmptyState title="Nothing prebooked" description="Booked or dispatched loads with a pickup more than 24 hours out will appear here, grouped by team."
            action={canAssign ? <LinkButton href="/loads/new" size="sm" variant="secondary">Book a load</LinkButton> : undefined} />
        </Card>
      )}

      {groups.map((g) => (
        <Card key={g.key} flush
          title={<span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full ring-1 ring-line" style={{ background: g.color ?? "var(--fg-faint)" }} />{g.name}<span className="num font-normal text-fg-subtle">{g.loads.length}</span></span>}
          actions={<span className="num text-[11px] text-fg-subtle">{g.loads.filter((l) => !l.driverId).length} unassigned</span>}>
          <Table dense stickyHead={false} head={["Load", "Status", "Customer", "Route", "Pickup", "Delivery", "Km", "Driver / truck", ...(showMoney ? ["Rate"] : []), ""]}>
            {g.loads.map((l) => {
              const hasRc = l.documents.some((d) => d.kind === "RC");
              return (
                <tr key={l.id}>
                  <td>
                    <div className="flex items-center gap-1.5">
                      <Link href={`/loads/${l.id}`} className="num font-medium text-fg hover:text-accent-text hover:underline">{l.reference}</Link>
                      {!hasRc && <Chip tone="warn" title="No rate confirmation on file">No RC</Chip>}
                      {(l.priority === "URGENT" || l.priority === "HIGH") && <Chip tone={l.priority === "URGENT" ? "danger" : "warn"}>{l.priority === "URGENT" ? "Urgent" : "High"}</Chip>}
                    </div>
                  </td>
                  <td><Badge value={l.status} label={LOAD_STATUS_LABELS[l.status as LoadStatus]} /></td>
                  <td className="max-w-44 truncate text-fg-muted">{l.customer.name}</td>
                  <td className="whitespace-nowrap">{l.originCity} <span className="text-fg-faint">→</span> {l.destCity}</td>
                  <td className="whitespace-nowrap"><span className="num">{dateTime(l.pickupAt)}</span><span className="block text-[11px] text-fg-subtle">{ago(l.pickupAt)}</span></td>
                  <td className="num whitespace-nowrap text-fg-muted">{dateTime(l.deliveryAt)}</td>
                  <td className="num text-fg-muted">{number(l.distanceKm)}</td>
                  <td className="whitespace-nowrap">
                    {l.driver ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Link href={`/drivers/${l.driver.id}`} className="hover:underline">{l.driver.name}</Link>
                        <Chip>{DRIVER_TYPE_SHORT[l.driver.type] ?? l.driver.type}</Chip>
                        {l.driver.hold && <Chip tone="warn">Hold</Chip>}
                        {l.truck && <span className="num text-fg-subtle">· {l.truck.unitNumber}</span>}
                      </span>
                    ) : <Chip tone="warn">Unassigned</Chip>}
                  </td>
                  {showMoney && <td className="num">{money(l.rate)}</td>}
                  <td className="text-right">
                    {canAssign
                      ? <LinkButton href={`/loads/${l.id}`} variant={l.driver ? "ghost" : "secondary"} size="sm">{l.driver ? "Open" : "Assign"}</LinkButton>
                      : <Link href={`/loads/${l.id}`} className="text-[12px] text-fg-muted hover:text-fg hover:underline">Open</Link>}
                  </td>
                </tr>
              );
            })}
          </Table>
        </Card>
      ))}
    </div>
  );
}
