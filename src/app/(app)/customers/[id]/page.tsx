import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { getCurrentUser, requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { LOAD_STATUS_LABELS, type LoadStatus } from "@/lib/constants";
import { money, date, dateTime } from "@/lib/format";
import { DocumentsPanel } from "@/components/documents/panel";
import { Badge, Card, DL, LinkButton, PageHeader, Progress, Stat, Table } from "@/components/ui";

export async function generateMetadata({ params }: PageProps<"/customers/[id]">) {
  if (!(await getCurrentUser())) return {};
  const r = await db.customer.findUnique({ where: { id: (await params).id }, select: { name: true } });
  return { title: r?.name ?? "Not found" };
}

export default async function CustomerDetail({ params }: PageProps<"/customers/[id]">) {
  const user = await requireUser("customers.view");
  const { id } = await params;
  const c = await db.customer.findUnique({
    where: { id },
    include: {
      loads: { orderBy: { pickupAt: "desc" }, take: 25 },
      invoices: { orderBy: { issuedAt: "desc" }, take: 15 },
    },
  });
  if (!c) notFound();
  const showMoney = can(user.role, "finance.view") || can(user.role, "loads.edit");
  const [total, openAr] = await Promise.all([
    db.load.aggregate({ where: { customerId: id, status: { in: ["DELIVERED", "INVOICED"] } }, _sum: { rate: true }, _count: true }),
    db.invoice.aggregate({ where: { customerId: id, status: "SENT" }, _sum: { amount: true } }),
  ]);
  const ar = openAr._sum.amount ?? 0;

  return (
    <>
      <PageHeader title={c.name} subtitle={`${c.city ?? ""}${c.country ? `, ${c.country}` : ""} · Net ${c.paymentTerms}`}
        actions={<>
          {can(user.role, "customers.edit") && <LinkButton href={`/customers/${id}/edit`} variant="secondary"><Pencil className="h-4 w-4" />Edit</LinkButton>}
          {can(user.role, "loads.edit") && <LinkButton href={`/loads/new?customer=${id}`}><Plus className="h-4 w-4" />New load</LinkButton>}
        </>} />
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Lifetime loads" value={total._count} />
        {showMoney && <Stat label="Lifetime revenue" value={money(total._sum.rate)} tone="green" />}
        {showMoney && <Stat label="Open receivables" value={money(ar)} tone={ar > c.creditLimit * 0.8 ? "red" : "slate"} />}
        {showMoney && <Stat label="Credit limit" value={money(c.creditLimit)} hint={<Progress value={Math.min(1, ar / c.creditLimit)} className="mt-1" />} />}
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title="Loads" bodyClassName="p-0">
            <Table head={["Load", "Status", "Route", "Pickup", ...(showMoney ? ["Rate"] : [])]} empty={c.loads.length === 0}>
              {c.loads.map((l) => (
                <tr key={l.id}>
                  <td><Link href={`/loads/${l.id}`} className="font-medium text-blue-700 hover:underline">{l.reference}</Link></td>
                  <td><Badge value={l.status} label={LOAD_STATUS_LABELS[l.status as LoadStatus]} /></td>
                  <td>{l.originCity} → {l.destCity}</td>
                  <td>{dateTime(l.pickupAt)}</td>
                  {showMoney && <td>{money(l.rate)}</td>}
                </tr>
              ))}
            </Table>
          </Card>
          {can(user.role, "finance.view") && (
            <Card title="Invoices" bodyClassName="p-0">
              <Table head={["Invoice", "Issued", "Due", "Amount", "Status"]} empty={c.invoices.length === 0}>
                {c.invoices.map((i) => (
                  <tr key={i.id}>
                    <td><Link href={`/finance/invoices/${i.id}`} className="font-medium text-blue-700 hover:underline">{i.number}</Link></td>
                    <td>{date(i.issuedAt)}</td><td>{date(i.dueAt)}</td><td>{money(i.amount * (1 + i.taxRate))}</td>
                    <td><Badge value={i.status === "SENT" && i.dueAt < new Date() ? "OVERDUE" : i.status} /></td>
                  </tr>
                ))}
              </Table>
            </Card>
          )}
        </div>
        <div className="space-y-6">
        <Card title="Contact" className="h-fit">
          <DL items={[
            ["Contact", c.contactName], ["Phone", c.phone], ["Email", c.email], ["Address", c.address],
            ["Tax ID", c.taxId], ["Customer since", date(c.createdAt)],
          ]} />
          {c.notes && <p className="mt-4 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm">{c.notes}</p>}
        </Card>
        <DocumentsPanel user={user} target={{ type: "customer", id }} path={`/customers/${id}`} withExpiry />
        </div>
      </div>
    </>
  );
}
