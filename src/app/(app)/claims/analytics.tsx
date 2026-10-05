import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { CLAIM_FAULT_LABELS, CLAIM_TYPE_LABELS } from "@/lib/constants";
import { money, number } from "@/lib/format";
import { Card, Table } from "@/components/ui";
import { Bars, Donut, TrendLine, type ChartTone } from "@/components/charts";
import { claimAnalytics } from "./query";
import { FAULT_TONE, claimStatusLabel, claimsHref, type ClaimFilters } from "./shared";

const FAULT_CHART_TONE: Record<string, ChartTone> = { OURS: "danger", THIRD_PARTY: "info", SHARED: "warn", UNKNOWN: "neutral" };

/** Analytics tab: where claims come from, where they sit in the lifecycle, how the volume moves and who is involved. */
export async function ClaimAnalytics({ where, filters }: { where: Prisma.ClaimWhereInput; filters: ClaimFilters }) {
  const a = await claimAnalytics(where);
  const tableHref = (patch: Partial<Record<keyof ClaimFilters, string | undefined>>) => claimsHref(filters, { tab: undefined, ...patch });
  const ours = a.faults.find((f) => f.fault === "OURS")?.count ?? 0;
  const oursPct = a.total ? Math.round((ours / a.total) * 100) : 0;
  const opened12 = a.monthly.reduce((x, m) => x + m.opened, 0);
  const closed12 = a.monthly.reduce((x, m) => x + m.closed, 0);
  const inFlight = a.funnel.filter((f) => ["NEGOTIATION", "DISPUTED", "LITIGATION"].includes(f.status)).reduce((x, f) => x + f.count, 0);

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card title="Claims by type" actions={<span className="num text-[11px] text-fg-subtle">{number(a.total)} claims</span>}>
        <Bars
          data={a.byType.map((t) => ({
            label: CLAIM_TYPE_LABELS[t.type] ?? t.type, value: t.count, tone: "info" as const,
            hint: `${t.count} claims · claimed ${money(t.claimed)} · settled ${money(t.settled)}`,
            href: tableHref({ type: t.type }),
          }))}
          format="number" labelWidth={140} valueWidth={40} />
        {a.byType.length > 0 && (
          <p className="mt-3 text-[11px] text-fg-subtle">
            Most frequent: {CLAIM_TYPE_LABELS[a.byType[0].type]} ({a.byType[0].count}) · largest exposure: {(() => { const top = [...a.byType].sort((x, y) => y.claimed - x.claimed)[0]; return `${CLAIM_TYPE_LABELS[top.type]} ${money(top.claimed)}`; })()}. Click a type to open those claims.
          </p>
        )}
      </Card>

      <Card title="Fault split" actions={a.total > 0 && <span className={oursPct >= 50 ? "num text-[11px] text-warn" : "num text-[11px] text-fg-subtle"}>{oursPct}% ours</span>}>
        <Donut
          data={a.faults.map((f) => ({ name: CLAIM_FAULT_LABELS[f.fault] ?? f.fault, value: f.count }))}
          tones={a.faults.map((f) => FAULT_CHART_TONE[f.fault] ?? "neutral")}
          height={220} totalLabel="claims" />
        <p className="mt-2 text-[11px] text-fg-subtle">
          {a.total === 0 ? "Fault is recorded on every claim; the split appears once claims are filed."
            : `${ours} of ${a.total} claims are our fault — those are the ones training and maintenance can prevent.`}
        </p>
      </Card>

      <Card title="Status funnel" actions={inFlight > 0 && <span className="num text-[11px] text-fg-subtle">{inFlight} contested</span>}>
        {/* Counts are small whole numbers: Bars prints them as-is (a numeric axis would repeat ticks like 0 0 1 1). */}
        <Bars
          data={a.total === 0 ? [] : a.funnel.map((f) => ({
            label: claimStatusLabel(f.status), value: f.count,
            hint: `${f.count} ${f.count === 1 ? "claim" : "claims"} ${claimStatusLabel(f.status).toLowerCase()}`,
            href: f.count > 0 ? tableHref({ status: f.status }) : undefined,
          }))}
          tone="progress" format="number" labelWidth={104} valueWidth={40} />
        {a.total > 0 && <p className="mt-3 text-[11px] text-fg-subtle">Where each claim sits now, in lifecycle order. Click a status to open those claims.</p>}
      </Card>

      <Card title="Claims per month" className="xl:col-span-2"
        actions={<span className="num text-[11px] text-fg-subtle">{opened12} opened · {closed12} closed · last 12 months</span>}>
        <TrendLine data={a.monthly} lines={[{ key: "opened", name: "Opened", tone: "warn" }, { key: "closed", name: "Closed", tone: "ok" }]} height={240} format="number" />
        <p className="mt-2 text-[11px] text-fg-subtle">Opened counts the month the claim was filed, closed the month it was paid, closed or denied. A gap between the lines is the backlog growing or shrinking.</p>
      </Card>

      <Card title="Top drivers by claims" flush>
        <Table dense head={["Driver", "Claims", "Open", "Claimed", <span key="r" className="block text-right">Per 100 loads</span>]}
          empty={a.drivers.length === 0} emptyTitle="No driver-linked claims" emptyDescription="Claims that name a driver are ranked here, with their load volume over the last 12 months for context.">
          {a.drivers.map((d) => (
            <tr key={d.id}>
              <td>
                <Link href={`/drivers/${d.id}`} className="font-medium text-fg hover:underline">{d.name}</Link>
                {d.ours > 0 && <div className="text-[11px] text-danger">{d.ours} our fault</div>}
              </td>
              <td className="num">{d.claims}</td>
              <td className={d.open ? "num text-warn" : "num text-fg-subtle"}>{d.open}</td>
              <td className="num">{money(d.claimed)}</td>
              <td className="num text-right text-fg-muted" title={`${d.loads} loads in the last 12 months`}>{d.per100 == null ? "—" : d.per100}</td>
            </tr>
          ))}
        </Table>
        {a.drivers.length > 0 && (
          <p className="border-t border-line px-4 py-2 text-[11px] text-fg-subtle">
            Per 100 loads uses each driver&apos;s non-cancelled loads with a pickup in the last 12 months. Fault shown in <span className={FAULT_TONE.OURS === "danger" ? "text-danger" : ""}>red</span> is ours.
          </p>
        )}
      </Card>
    </div>
  );
}
