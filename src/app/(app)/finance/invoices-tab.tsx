import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { date, money, number } from "@/lib/format";
import { Badge, Card, Cell, Chip, FilterPills, Table, cn } from "@/components/ui";
import type { InvoiceRow } from "./data";
import { FILTER_LABELS, INVOICE_FILTERS, daysLate, financeHref, invoiceBadge, invoiceTotal, isOverdue, type InvoiceFilter } from "./shared";
import { InvoiceActions } from "./invoice-actions";

const EMPTY: Record<InvoiceFilter, [string, string]> = {
  open: ["No open invoices", "Every invoice has been paid or voided. New drafts appear here when loads are invoiced from the billing queue."],
  overdue: ["No overdue invoices", "Every sent invoice is still within its payment terms."],
  DRAFT: ["No draft invoices", "Create one from the billing queue, then mark it sent once it has gone to the customer."],
  SENT: ["No invoices awaiting payment", "Sent invoices stay here until a payment is recorded."],
  PAID: ["No paid invoices yet", "Payments recorded against sent invoices appear here."],
  VOID: ["No voided invoices", "Voided invoices are kept for the record and listed here."],
  all: ["No invoices yet", "Invoices are created from delivered loads on the billing queue."],
};

function Due({ i, now }: { i: InvoiceRow; now: Date }) {
  if (i.status === "PAID") {
    const early = i.paidAt ? daysLate(i.dueAt, i.paidAt) : null;
    return (
      <div className="whitespace-nowrap">
        <div className="num text-fg-muted">{date(i.dueAt)}</div>
        <div className="text-[11px] text-ok">paid {date(i.paidAt)}{early != null && early > 0 ? ` · ${early} d late` : ""}</div>
      </div>
    );
  }
  if (i.status === "VOID" || i.status === "DRAFT") return <span className="num text-fg-subtle">{date(i.dueAt)}</span>;
  const late = daysLate(i.dueAt, now);
  const overdue = late > 0;
  return (
    <div className="whitespace-nowrap">
      <div className={cn("num", overdue ? "font-medium text-danger" : "text-fg-muted")}>{date(i.dueAt)}</div>
      <div className={cn("text-[11px]", overdue ? "text-danger" : late >= -7 ? "text-warn" : "text-fg-subtle")}>
        {overdue ? `${late} d late` : late === 0 ? "due today" : `due in ${-late} d`}
      </div>
    </div>
  );
}

export function InvoicesTab({ invoices, filter, counts, editable, now }: {
  invoices: InvoiceRow[]; filter: InvoiceFilter; counts: Record<InvoiceFilter, number>; editable: boolean; now: Date;
}) {
  const total = invoices.reduce((a, i) => a + invoiceTotal(i), 0);
  const overdueTotal = invoices.filter((i) => isOverdue(i, now)).reduce((a, i) => a + invoiceTotal(i), 0);
  const [emptyTitle, emptyDescription] = EMPTY[filter];
  return (
    <div className="space-y-3">
      <FilterPills active={filter} items={INVOICE_FILTERS.map((k) => ({ key: k, label: FILTER_LABELS[k], href: financeHref({ tab: "invoices", status: k }), count: counts[k] }))} />
      <Card flush
        actions={
          <span className="num text-[11px] text-fg-subtle">
            {number(invoices.length)} {invoices.length === 1 ? "invoice" : "invoices"} · {money(total)} incl. VAT
            {overdueTotal > 0 && filter !== "overdue" && <> · <span className="text-danger">{money(overdueTotal)} overdue</span></>}
          </span>
        }
        title={`${FILTER_LABELS[filter]} invoices`}>
        <Table dense
          head={["Invoice", "Bill to", "Issued", "Due", <span key="t" className="block text-right">Total incl. VAT</span>, "Status", ""]}
          empty={invoices.length === 0} emptyTitle={emptyTitle} emptyDescription={emptyDescription}>
          {invoices.map((i) => (
            <tr key={i.id} className="group">
              <td>
                <Link href={`/finance/invoices/${i.id}`} className="num font-medium text-fg hover:underline">{i.number}</Link>
                {i.load && (
                  <div className="num text-[11px] text-fg-subtle">
                    <Link href={`/loads/${i.load.id}`} className="hover:underline">{i.load.reference}</Link>
                  </div>
                )}
              </td>
              <td className="max-w-60">
                <Cell
                  primary={<span className="flex items-center gap-1.5"><Link href={`/customers/${i.customer.id}`} className="truncate hover:underline">{i.customer.name}</Link>{i.customer.kind === "BROKER" && <Chip>Broker</Chip>}</span>}
                  secondary={i.load ? <span className="flex items-center gap-1">{i.load.originCity}<ArrowRight className="h-3 w-3 shrink-0 text-fg-faint" />{i.load.destCity}</span> : "Transportation services"}
                />
              </td>
              <td className="num whitespace-nowrap text-fg-muted">{date(i.issuedAt)}</td>
              <td><Due i={i} now={now} /></td>
              <td className="num text-right font-medium">{money(invoiceTotal(i))}</td>
              <td><Badge value={invoiceBadge(i, now)} dot /></td>
              <td className="w-px whitespace-nowrap">{editable && <InvoiceActions id={i.id} number={i.number} status={i.status} compact />}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}
