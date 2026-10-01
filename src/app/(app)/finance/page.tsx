import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { INVOICE_STATUSES } from "@/lib/constants";
import { money, date, daysAgo } from "@/lib/format";
import { receivables, monthlyFinancials } from "@/lib/stats";
import { invoiceLoad } from "@/app/actions/finance";
import { Badge, Card, PageHeader, Stat, Table, buttonClass } from "@/components/ui";
import { SimpleBar } from "@/components/charts";
import { InvoiceActions } from "./invoice-actions";

export const metadata = { title: "Finance" };

export default async function FinancePage({ searchParams }: PageProps<"/finance">) {
  const user = await requireUser("finance.view");
  const editable = can(user.role, "finance.edit");
  const sp = await searchParams;
  const filter = typeof sp.status === "string" ? sp.status : "open";
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const where =
    filter === "open" ? { status: { in: ["DRAFT", "SENT"] } }
    : filter === "overdue" ? { status: "SENT", dueAt: { lt: now } }
    : INVOICE_STATUSES.includes(filter as never) ? { status: filter } : {};

  const [ar, invoices, ready, collected, months, paidInvoices] = await Promise.all([
    receivables(),
    db.invoice.findMany({ where, orderBy: { issuedAt: "desc" }, take: 100, include: { customer: { select: { name: true } }, load: { select: { reference: true, id: true } } } }),
    db.load.findMany({ where: { status: "DELIVERED" }, orderBy: { deliveredAt: "asc" }, include: { customer: { select: { name: true } } } }),
    db.invoice.aggregate({ where: { status: "PAID", paidAt: { gte: monthStart } }, _sum: { amount: true } }),
    monthlyFinancials(6),
    db.invoice.findMany({ where: { status: "PAID", paidAt: { gte: daysAgo(90) } }, select: { issuedAt: true, paidAt: true } }),
  ]);
  const dso = paidInvoices.length
    ? Math.round(paidInvoices.reduce((a, i) => a + (i.paidAt!.getTime() - i.issuedAt.getTime()) / 86_400_000, 0) / paidInvoices.length) : 0;
  const unbilled = ready.reduce((a, l) => a + l.rate, 0);
  const tabs = [["open", "Open"], ["overdue", "Overdue"], ["DRAFT", "Draft"], ["SENT", "Sent"], ["PAID", "Paid"], ["VOID", "Void"], ["all", "All"]];

  return (
    <>
      <PageHeader title="Finance" subtitle="Billing, receivables and cash collection." />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Open receivables" value={money(ar.total)} hint={`${ar.count} invoices`} tone="blue" />
        <Stat label="Overdue" value={money(ar.overdue)} tone={ar.overdue ? "red" : "green"} />
        <Stat label="Collected this month" value={money(collected._sum.amount)} tone="green" />
        <Stat label="Unbilled (delivered)" value={money(unbilled)} hint={`${ready.length} loads ready`} tone="amber" />
        <Stat label="Days to pay (DSO)" value={`${dso} days`} hint="avg., last 90 days" />
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-3">
        <Card title="Receivables aging (incl. VAT)">
          <SimpleBar data={Object.entries(ar.aging).map(([k, v]) => ({ bucket: k === "current" ? "Not due" : `${k} days`, amount: Math.round(v) }))} dataKey="amount" nameKey="bucket" money color="#7c3aed" height={220} />
        </Card>
        <Card title="Gross margin by month" className="xl:col-span-2">
          <SimpleBar data={months} dataKey="margin" nameKey="month" money color="#10b981" height={220} />
        </Card>
      </div>

      {ready.length > 0 && (
        <Card title={`Ready to invoice (${ready.length})`} className="mb-6" bodyClassName="p-0">
          <Table head={["Load", "Customer", "Route", "Delivered", "Amount", ""]}>
            {ready.map((l) => (
              <tr key={l.id}>
                <td><Link href={`/loads/${l.id}`} className="font-medium text-blue-700 hover:underline">{l.reference}</Link></td>
                <td>{l.customer.name}</td>
                <td>{l.originCity} → {l.destCity}</td>
                <td>{date(l.deliveredAt)}</td>
                <td className="font-medium">{money(l.rate)}</td>
                <td>{editable && <form action={invoiceLoad.bind(null, l.id)}><button className={buttonClass("primary", "sm")}>Create invoice</button></form>}</td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map(([k, label]) => (
          <Link key={k} href={`/finance?status=${k}`} className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${filter === k ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200"}`}>{label}</Link>
        ))}
      </div>
      <Card bodyClassName="p-0">
        <Table head={["Invoice", "Customer", "Load", "Issued", "Due", "Total (incl. VAT)", "Status", ""]} empty={invoices.length === 0}>
          {invoices.map((i) => {
            const overdue = i.status === "SENT" && i.dueAt < now;
            return (
              <tr key={i.id}>
                <td><Link href={`/finance/invoices/${i.id}`} className="font-semibold text-blue-700 hover:underline">{i.number}</Link></td>
                <td>{i.customer.name}</td>
                <td>{i.load ? <Link href={`/loads/${i.load.id}`} className="hover:underline">{i.load.reference}</Link> : "—"}</td>
                <td>{date(i.issuedAt)}</td>
                <td className={overdue ? "font-medium text-rose-600" : ""}>{date(i.dueAt)}</td>
                <td className="font-medium">{money(i.amount * (1 + i.taxRate))}</td>
                <td><Badge value={overdue ? "OVERDUE" : i.status} /></td>
                <td>{editable && <InvoiceActions id={i.id} status={i.status} compact />}</td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </>
  );
}
