import Link from "next/link";
import { Plus, Building2, Handshake, Receipt, AlertTriangle, BadgeDollarSign } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { CUSTOMER_KIND_LABELS } from "@/lib/constants";
import { daysAgo, money, number } from "@/lib/format";
import { Card, Cell, Chip, EmptyState, LinkButton, PageHeader, Progress, Segmented, Stat, Table, cn } from "@/components/ui";
import { LinkRow } from "../drivers/link-row";
import { CustomerSearch } from "./filters";
import { ACTIVE_LOAD_STATUSES, COMPLETED_LOAD_STATUSES, KIND_FILTERS, KIND_SHORT, KIND_TONE, creditTone, grossInvoice, isBroker, isShipper, type KindFilter } from "./shared";

export const metadata = { title: "Customers & brokers" };

const str = (v: string | string[] | undefined) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

export default async function CustomersPage({ searchParams }: PageProps<"/customers">) {
  const user = await requireUser("customers.view");
  const editable = can(user.role, "customers.edit");
  const sp = await searchParams;
  const kindParam = str(sp.kind)?.toUpperCase();
  const kind: KindFilter = kindParam && (KIND_FILTERS as readonly string[]).includes(kindParam) ? (kindParam as KindFilter) : "ALL";
  const q = str(sp.q) ?? "";
  const since = daysAgo(90);
  const now = new Date();

  const [all, revAsCustomer, revAsBroker, activeAsCustomer, activeAsBroker, openInvoices] = await Promise.all([
    db.customer.findMany({ orderBy: { name: "asc" } }),
    db.load.groupBy({ by: ["customerId"], where: { status: { in: [...COMPLETED_LOAD_STATUSES] }, deliveredAt: { gte: since } }, _sum: { rate: true }, _count: true }),
    db.load.groupBy({ by: ["brokerId"], where: { brokerId: { not: null }, status: { in: [...COMPLETED_LOAD_STATUSES] }, deliveredAt: { gte: since } }, _sum: { rate: true }, _count: true }),
    db.load.groupBy({ by: ["customerId"], where: { status: { in: [...ACTIVE_LOAD_STATUSES] } }, _count: true }),
    db.load.groupBy({ by: ["brokerId"], where: { brokerId: { not: null }, status: { in: [...ACTIVE_LOAD_STATUSES] } }, _count: true }),
    db.invoice.findMany({ where: { status: "SENT" }, select: { customerId: true, amount: true, taxRate: true, dueAt: true } }),
  ]);

  type Row = { revCustomer: number; revBroker: number; loads90: number; active: number; ar: number; overdue: number; overdueCount: number };
  const stats = new Map<string, Row>();
  const row = (id: string) => { let r = stats.get(id); if (!r) { r = { revCustomer: 0, revBroker: 0, loads90: 0, active: 0, ar: 0, overdue: 0, overdueCount: 0 }; stats.set(id, r); } return r; };
  for (const g of revAsCustomer) { const r = row(g.customerId); r.revCustomer += g._sum.rate ?? 0; r.loads90 += g._count; }
  for (const g of revAsBroker) { const r = row(g.brokerId!); r.revBroker += g._sum.rate ?? 0; r.loads90 += g._count; }
  for (const g of activeAsCustomer) row(g.customerId).active += g._count;
  for (const g of activeAsBroker) row(g.brokerId!).active += g._count;
  for (const i of openInvoices) { const r = row(i.customerId); const gross = grossInvoice(i); r.ar += gross; if (i.dueAt < now) { r.overdue += gross; r.overdueCount += 1; } }

  // KPIs are book-wide, not affected by the filter.
  const shippers = all.filter((c) => isShipper(c.kind)).length;
  const brokers = all.filter((c) => isBroker(c.kind)).length;
  const revenue90 = revAsCustomer.reduce((a, g) => a + (g._sum.rate ?? 0), 0); // every load has exactly one customer, so this is the unique total
  const loads90 = revAsCustomer.reduce((a, g) => a + g._count, 0);
  const brokered90 = revAsBroker.reduce((a, g) => a + (g._sum.rate ?? 0), 0);
  const openAr = openInvoices.reduce((a, i) => a + grossInvoice(i), 0);
  const overdueInv = openInvoices.filter((i) => i.dueAt < now);
  const overdue = overdueInv.reduce((a, i) => a + grossInvoice(i), 0);
  const overLimit = all.filter((c) => c.creditLimit > 0 && (stats.get(c.id)?.ar ?? 0) >= c.creditLimit * 0.9).length;

  const needle = q.toLowerCase();
  const customers = all.filter((c) => {
    if (kind === "SHIPPER" && !isShipper(c.kind)) return false;
    if (kind === "BROKER" && !isBroker(c.kind)) return false;
    if (needle) {
      const hay = [c.name, c.contactName, c.email, c.phone, c.city, c.country, c.taxId].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
  const href = (k: KindFilter) => { const p = new URLSearchParams(); if (k !== "ALL") p.set("kind", k); if (q) p.set("q", q); const s = p.toString(); return `/customers${s ? `?${s}` : ""}`; };
  const filtered = kind !== "ALL" || Boolean(q);
  const showBrokerSplit = customers.some((c) => (stats.get(c.id)?.revBroker ?? 0) > 0);

  return (
    <>
      <PageHeader
        eyebrow="People & partners"
        title="Customers & brokers"
        subtitle={`${shippers} shippers · ${brokers} brokers · ${number(loads90)} loads delivered in the last 90 days`}
        actions={editable && <LinkButton href="/customers/new"><Plus />Add customer</LinkButton>}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Link href={href("SHIPPER")} className="group block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
          <Stat className="h-full transition-colors group-hover:border-line-strong" label="Customers" value={shippers} hint="shippers we haul for" icon={<Building2 />} />
        </Link>
        <Link href={href("BROKER")} className="group block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
          <Stat className="h-full transition-colors group-hover:border-line-strong" label="Brokers" value={brokers} hint={brokered90 ? `${money(brokered90)} brokered in 90d` : "no brokered loads in 90d"} icon={<Handshake />} />
        </Link>
        <Stat label="Revenue (90d)" value={money(revenue90)} hint={loads90 ? `${money(Math.round(revenue90 / loads90))} per load` : "no deliveries yet"} icon={<BadgeDollarSign />} />
        <Stat label="Open A/R" value={money(openAr)} hint={`${openInvoices.length} invoices sent, unpaid${overLimit ? ` · ${overLimit} near credit limit` : ""}`} tone={overLimit ? "warn" : "neutral"} icon={<Receipt />} />
        <Stat label="Overdue" value={money(overdue)} hint={overdue ? `${overdueInv.length} past due date` : "nothing past due"} tone={overdue ? "danger" : "ok"} icon={<AlertTriangle />} />
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented active={kind} items={[
            { key: "ALL", label: "All", href: href("ALL"), count: all.length },
            { key: "SHIPPER", label: "Shippers", href: href("SHIPPER"), count: shippers },
            { key: "BROKER", label: "Brokers", href: href("BROKER"), count: brokers },
          ]} />
          <CustomerSearch q={q} kind={kind} />
        </div>
        <p className="text-[11px] text-fg-subtle">Showing <span className="num">{customers.length}</span> of <span className="num">{all.length}</span></p>
      </div>

      <Card flush>
        <Table head={["Name", "Contact", "City", "Active loads", "Loads (90d)", "Revenue (90d)", "Open A/R", "Credit used", "Terms"]}>
          {customers.map((c) => {
            const s = stats.get(c.id);
            const rev = (s?.revCustomer ?? 0) + (s?.revBroker ?? 0);
            const ratio = c.creditLimit > 0 ? (s?.ar ?? 0) / c.creditLimit : 0;
            const tone = creditTone(ratio);
            return (
              <LinkRow key={c.id} href={`/customers/${c.id}`}>
                <td className="min-w-56">
                  <div className="flex items-center gap-1.5">
                    <Link href={`/customers/${c.id}`} className="truncate font-medium text-fg hover:underline">{c.name}</Link>
                    <Chip tone={KIND_TONE[c.kind]} title={CUSTOMER_KIND_LABELS[c.kind] ?? c.kind} className="normal-case tracking-normal">{KIND_SHORT[c.kind] ?? c.kind}</Chip>
                  </div>
                  {c.taxId && <div className="num mt-0.5 truncate text-[11px] text-fg-subtle">INN {c.taxId}</div>}
                </td>
                <td className="max-w-48">
                  {c.contactName || c.phone
                    ? <Cell primary={c.contactName ?? <span className="text-fg-faint">—</span>} secondary={c.phone ? <a href={`tel:${c.phone}`} className="num hover:underline">{c.phone}</a> : c.email} />
                    : <span className="text-fg-faint">—</span>}
                </td>
                <td className="whitespace-nowrap">{c.city ? <Cell primary={c.city} secondary={c.country ?? undefined} /> : <span className="text-fg-faint">—</span>}</td>
                <td className="num">{s?.active ? s.active : <span className="text-fg-faint">—</span>}</td>
                <td className="num">{s?.loads90 ? s.loads90 : <span className="text-fg-faint">—</span>}</td>
                <td>
                  {rev
                    ? <Cell mono primary={money(rev)} secondary={showBrokerSplit && s?.revBroker ? `${money(s.revBroker)} as broker` : undefined} />
                    : <span className="text-fg-faint">—</span>}
                </td>
                <td>
                  {s?.ar
                    ? <Cell mono primary={money(s.ar)} secondary={s.overdue ? <span className="text-danger">{money(s.overdue)} overdue · {s.overdueCount}</span> : undefined} />
                    : <span className="text-fg-faint">—</span>}
                </td>
                <td className="min-w-28">
                  <div className="flex items-center gap-2">
                    <Progress value={ratio} tone={tone} className="w-14" />
                    <span className={cn("num text-[12px]", tone === "danger" ? "font-medium text-danger" : tone === "warn" ? "text-warn" : "text-fg-muted")}>{Math.round(ratio * 100)}%</span>
                  </div>
                  <div className="num mt-0.5 text-[11px] text-fg-subtle">of {money(c.creditLimit)}</div>
                </td>
                <td className="num whitespace-nowrap text-fg-muted">Net {c.paymentTerms}</td>
              </LinkRow>
            );
          })}
        </Table>
        {customers.length === 0 && (
          all.length === 0
            ? <EmptyState title="No customers yet" description="Add the shippers you haul for and the brokers who tender you loads." action={editable && <LinkButton href="/customers/new"><Plus />Add customer</LinkButton>} />
            : <EmptyState title="No matches" description={filtered ? "Try the other kind, or clear the search." : "Nothing to show."} action={<LinkButton href="/customers" variant="secondary">Clear filters</LinkButton>} />
        )}
      </Card>
      {customers.length > 0 && (
        <p className="mt-2 text-[11px] text-fg-subtle">
          Revenue counts delivered loads by delivery date; a broker is credited for loads it tendered. Open A/R is sent, unpaid invoices including tax. Credit used compares open A/R with the credit limit.
        </p>
      )}
    </>
  );
}
