import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { dateTime } from "@/lib/format";
import { Badge, Card, PageHeader, Table } from "@/components/ui";

export const metadata = { title: "Audit log" };

const ENTITY_LINK: Record<string, string> = { load: "/loads/", truck: "/fleet/", driver: "/drivers/", customer: "/customers/", invoice: "/finance/invoices/", user: "/admin/users/" };
const ACTION_TONE: Record<string, string> = { create: "ACTIVE", update: "ASSIGNED", delete: "CANCELLED", status: "IN_TRANSIT", assign: "SENT", login: "NORMAL" };

export default async function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  await requireUser("audit.view");
  const sp = await searchParams;
  const entity = typeof sp.entity === "string" ? sp.entity : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const size = 50;
  const where = entity ? { entity } : {};
  const [rows, total, entities] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * size, take: size, include: { user: { select: { name: true, role: true } } } }),
    db.auditLog.count({ where }),
    db.auditLog.groupBy({ by: ["entity"], _count: true }),
  ]);
  const pages = Math.ceil(total / size);

  return (
    <>
      <PageHeader title="Audit log" subtitle="Every change, who made it and when. Records are append-only." />
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/admin/audit" className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ${!entity ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200"}`}>All</Link>
        {entities.map((e) => (
          <Link key={e.entity} href={`/admin/audit?entity=${e.entity}`} className={`rounded-full px-3 py-1 text-xs font-medium capitalize ring-1 ${entity === e.entity ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200"}`}>{e.entity} <span className="opacity-60">{e._count}</span></Link>
        ))}
      </div>
      <Card bodyClassName="p-0">
        <Table head={["When", "User", "Action", "Entity", "Details"]} empty={rows.length === 0}>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="whitespace-nowrap text-xs text-slate-500">{dateTime(r.createdAt)}</td>
              <td>{r.user?.name ?? "System"}</td>
              <td><Badge value={ACTION_TONE[r.action] ?? "NORMAL"} label={r.action} /></td>
              <td className="capitalize">{r.entityId && ENTITY_LINK[r.entity] ? <Link href={ENTITY_LINK[r.entity] + r.entityId} className="text-blue-700 hover:underline">{r.entity}</Link> : r.entity}</td>
              <td className="text-slate-600">{r.details}</td>
            </tr>
          ))}
        </Table>
      </Card>
      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-slate-500">Page {page} of {pages} · {total} entries</span>
          <div className="flex gap-2">
            {page > 1 && <Link className="text-blue-600 hover:underline" href={`/admin/audit?page=${page - 1}${entity ? `&entity=${entity}` : ""}`}>← Newer</Link>}
            {page < pages && <Link className="text-blue-600 hover:underline" href={`/admin/audit?page=${page + 1}${entity ? `&entity=${entity}` : ""}`}>Older →</Link>}
          </div>
        </div>
      )}
    </>
  );
}
