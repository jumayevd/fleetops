import Link from "next/link";
import { Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { money, daysAgo } from "@/lib/format";
import { Card, LinkButton, PageHeader, Table } from "@/components/ui";

export const metadata = { title: "Customers" };

export default async function CustomersPage() {
  const user = await requireUser("customers.view");
  const since = daysAgo(90);
  const [customers, rev, open, ar] = await Promise.all([
    db.customer.findMany({ orderBy: { name: "asc" } }),
    db.load.groupBy({ by: ["customerId"], where: { status: { in: ["DELIVERED", "INVOICED"] }, deliveredAt: { gte: since } }, _sum: { rate: true }, _count: true }),
    db.load.groupBy({ by: ["customerId"], where: { status: { in: ["PLANNED", "ASSIGNED", "IN_TRANSIT"] } }, _count: true }),
    db.invoice.groupBy({ by: ["customerId"], where: { status: "SENT" }, _sum: { amount: true } }),
  ]);
  const showMoney = can(user.role, "finance.view") || can(user.role, "loads.edit");

  return (
    <>
      <PageHeader title="Customers" subtitle="Shippers you haul for, with volume and credit exposure."
        actions={can(user.role, "customers.edit") && <LinkButton href="/customers/new"><Plus className="h-4 w-4" />Add customer</LinkButton>} />
      <Card bodyClassName="p-0">
        <Table head={["Customer", "Contact", "City", "Active loads", "Loads (90d)", ...(showMoney ? ["Revenue (90d)", "Open A/R", "Credit used"] : []), "Terms"]}>
          {customers.map((c) => {
            const r = rev.find((x) => x.customerId === c.id);
            const a = ar.find((x) => x.customerId === c.id)?._sum.amount ?? 0;
            const used = c.creditLimit ? a / c.creditLimit : 0;
            return (
              <tr key={c.id}>
                <td><Link href={`/customers/${c.id}`} className="font-semibold text-blue-700 hover:underline">{c.name}</Link></td>
                <td>{c.contactName}<span className="block text-xs text-slate-500">{c.phone}</span></td>
                <td>{c.city}</td>
                <td>{open.find((x) => x.customerId === c.id)?._count ?? 0}</td>
                <td>{r?._count ?? 0}</td>
                {showMoney && <>
                  <td className="font-medium">{money(r?._sum.rate)}</td>
                  <td>{money(a)}</td>
                  <td><span className={used > 0.8 ? "font-medium text-rose-600" : used > 0.5 ? "text-amber-600" : "text-slate-600"}>{Math.round(used * 100)}%</span></td>
                </>}
                <td>Net {c.paymentTerms}</td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </>
  );
}
