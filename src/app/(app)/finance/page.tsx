import { BarChart3 } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { money, number } from "@/lib/format";
import { LinkButton, PageHeader, Stat, Tabs } from "@/components/ui";
import { agingByCustomer, billingQueueLoads, financeKpis, invoiceCounts, invoiceList } from "./data";
import { FINANCE_TABS, TAB_LABELS, financeHref, parseFilter, parseTab } from "./shared";
import { QueueTab } from "./queue-tab";
import { InvoicesTab } from "./invoices-tab";
import { AgingTab } from "./aging-tab";

export const metadata = { title: "Finance" };

const SUBTITLE = {
  queue: "Delivered loads waiting on paperwork, and loads ready to bill.",
  invoices: "Every invoice by status: mark sent, record payments, void mistakes.",
  aging: "Who owes what, how late it is, and how much credit each customer is using.",
} as const;

const plural = (n: number, one: string, many = `${one}s`) => `${number(n)} ${n === 1 ? one : many}`;

export default async function FinancePage({ searchParams }: PageProps<"/finance">) {
  const user = await requireUser("finance.view");
  const editable = can(user.role, "finance.edit");
  const sp = await searchParams;
  const filter = parseFilter(sp.status);
  const tab = parseTab(sp.tab, sp.status);
  const now = new Date();

  const [kpi, queue, counts, invoices, aging] = await Promise.all([
    financeKpis(now),
    billingQueueLoads(),
    invoiceCounts(now),
    tab === "invoices" ? invoiceList(filter, now) : Promise.resolve([]),
    agingByCustomer(now),
  ]);

  const overduePct = kpi.receivables ? Math.round((kpi.overdue / kpi.receivables) * 100) : 0;
  // Tab counts are the things that need attention: loads in the queue, open invoices, customers past due.
  const tabCounts = { queue: queue.missing.length + queue.ready.length, invoices: counts.open, aging: aging.filter((r) => r.overdue > 0).length } as const;

  return (
    <>
      <PageHeader
        eyebrow="Money & safety"
        title="Finance"
        subtitle={SUBTITLE[tab]}
        actions={<LinkButton href="/reports" variant="secondary"><BarChart3 />Reports</LinkButton>}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Open receivables" value={money(kpi.receivables)}
          hint={kpi.openCount ? `${plural(kpi.openCount, "sent invoice")} · incl. VAT` : "no invoices awaiting payment"} />
        <Stat label="Overdue" value={money(kpi.overdue)} tone={kpi.overdue > 0 ? "danger" : "ok"}
          delta={kpi.overdue > 0 ? `${overduePct}%` : undefined} deltaTone="danger"
          hint={kpi.oldestOverdue ? `of receivables · ${plural(kpi.overdueCount, "invoice")} · oldest ${kpi.oldestOverdue.days} d` : "nothing past due"} />
        <Stat label={`Collected in ${kpi.monthLabel}`} value={money(kpi.collected)} tone="ok"
          hint={`${kpi.collectedCount ? plural(kpi.collectedCount, "payment") : "no payments yet"} · ${money(kpi.collectedLastMonth)} in ${kpi.lastMonthShort}`} />
        <Stat label="Unbilled" value={money(kpi.unbilled)} tone={kpi.missingCount ? "warn" : "neutral"}
          hint={kpi.unbilledCount ? `${plural(kpi.unbilledCount, "load")} · ${kpi.missingCount ? `${money(kpi.missing)} needs docs` : "paperwork complete"}` : "every completed load is invoiced"} />
        <Stat label="Ready to invoice" value={money(kpi.ready)} tone={kpi.readyCount ? "accent" : "neutral"}
          hint={kpi.readyCount ? `${plural(kpi.readyCount, "load")} · RC and POD on file` : "nothing waiting to be billed"} />
        <Stat label="DSO" value={kpi.dso == null ? "—" : `${kpi.dso} d`}
          hint={kpi.dso == null ? "no payments in the last 90 days" : `issue to payment · ${kpi.dsoSample} paid in 90 d`} />
      </div>

      <Tabs active={tab} tabs={FINANCE_TABS.map((t) => ({
        key: t, label: TAB_LABELS[t], count: tabCounts[t] || undefined,
        href: financeHref({ tab: t, status: t === "invoices" ? filter : undefined }),
      }))} />

      {tab === "queue" && <QueueTab missing={queue.missing} ready={queue.ready} editable={editable} now={now} />}
      {tab === "invoices" && <InvoicesTab invoices={invoices} filter={filter} counts={counts} editable={editable} now={now} />}
      {tab === "aging" && <AgingTab aging={kpi.aging} rows={aging} />}
    </>
  );
}
