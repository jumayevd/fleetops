import Link from "next/link";
import { Plus } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { startOfMonth } from "date-fns";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { WORK_ORDER_CATEGORIES, WORK_ORDER_CATEGORY_LABELS, WORK_ORDER_PRIORITIES, WORK_ORDER_STATUSES, humanize } from "@/lib/constants";
import { date, money, number } from "@/lib/format";
import { Badge, Card, Cell, FilterPills, LinkButton, PageHeader, Stat, Table } from "@/components/ui";
import { daysBetween, str } from "../_lib/data";
import { newWorkOrderHref, workOrderHref, workOrdersHref } from "../_lib/links";
import { FilterBar } from "../_components/filter-bar";
import { Priority, UnitLink } from "../_components/unit-link";
import { WorkOrderStatusButtons } from "../_components/work-order-status";

export const metadata = { title: "Work orders" };

const ACTIVE = ["DRAFT", "OPEN", "IN_PROGRESS"] as const;
/** Working order for the active list: what is in the shop first, then what is booked, then drafts. */
const STATUS_RANK: Record<string, number> = { IN_PROGRESS: 0, OPEN: 1, DRAFT: 2 };
const PRIORITY_RANK: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const PAGE = 250;

export default async function WorkOrdersPage({ searchParams }: PageProps<"/maintenance/work-orders">) {
  const user = await requireUser("fleet.view");
  const editable = can(user.role, "fleet.edit");
  const sp = await searchParams;
  const statusParam = str(sp.status);
  const status = statusParam && (WORK_ORDER_STATUSES as readonly string[]).includes(statusParam) ? statusParam : statusParam === "all" ? "all" : "active";
  const priority = str(sp.priority);
  const category = str(sp.category);
  const unit = str(sp.unit);
  const validPriority = priority && (WORK_ORDER_PRIORITIES as readonly string[]).includes(priority) ? priority : undefined;
  const validCategory = category && (WORK_ORDER_CATEGORIES as readonly string[]).includes(category) ? category : undefined;
  const filtered = Boolean(validPriority || validCategory || unit);

  const where: Prisma.WorkOrderWhereInput = {
    ...(status === "active" ? { status: { in: [...ACTIVE] } } : status === "all" ? {} : { status }),
    ...(validPriority ? { priority: validPriority } : {}),
    ...(validCategory ? { category: validCategory } : {}),
    ...(unit ? { OR: [{ truckId: unit }, { trailerId: unit }] } : {}),
  };
  const finished = status === "DONE" || status === "CANCELLED" || status === "all";

  const [fetched, byStatus, urgent, month, trucks, trailers] = await Promise.all([
    db.workOrder.findMany({
      where,
      orderBy: finished ? [{ completedAt: "desc" }, { scheduledAt: "desc" }] : { scheduledAt: "asc" },
      take: PAGE,
      include: { truck: { select: { id: true, unitNumber: true } }, trailer: { select: { id: true, unitNumber: true } } },
    }),
    db.workOrder.groupBy({ by: ["status"], _count: true }),
    db.workOrder.count({ where: { priority: "URGENT", status: { in: [...ACTIVE] } } }),
    db.workOrder.aggregate({ where: { status: "DONE", completedAt: { gte: startOfMonth(new Date()) } }, _sum: { cost: true }, _count: true }),
    db.truck.findMany({ orderBy: { unitNumber: "asc" }, select: { id: true, unitNumber: true, make: true, model: true } }),
    db.trailer.findMany({ orderBy: { unitNumber: "asc" }, select: { id: true, unitNumber: true } }),
  ]);
  const rows = finished
    ? fetched
    : [...fetched].sort((a, b) =>
        (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9)
        || (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9)
        || a.scheduledAt.getTime() - b.scheduledAt.getTime());
  const countOf = (s: string) => byStatus.find((c) => c.status === s)?._count ?? 0;
  const open = countOf("DRAFT") + countOf("OPEN");
  const inProgress = countOf("IN_PROGRESS");
  const total = byStatus.reduce((a, c) => a + c._count, 0);
  const pill = (key: string) => workOrdersHref({ status: key === "active" ? undefined : key, priority: validPriority, category: validCategory, unit });

  return (
    <>
      <PageHeader
        eyebrow="Fleet · Maintenance"
        title="Work orders"
        subtitle="Shop work from request to completion. Starting one puts the unit in the shop; completing it releases the unit."
        actions={
          <>
            <LinkButton href="/maintenance" variant="secondary">Maintenance overview</LinkButton>
            {editable && <LinkButton href={newWorkOrderHref()}><Plus />New work order</LinkButton>}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Open" value={open} tone={open ? "info" : "neutral"} hint={`${countOf("DRAFT")} drafts · ${countOf("OPEN")} scheduled`} />
        <Stat label="In progress" value={inProgress} tone={inProgress ? "warn" : "ok"} hint={inProgress ? "units in the shop" : "nothing in the shop"} />
        <Stat label="Urgent" value={urgent} tone={urgent ? "danger" : "ok"} hint={urgent ? "open or in progress" : "no urgent work open"} />
        <Stat label="Spend this month" value={money(month._sum.cost)} hint={`${month._count} completed since ${date(startOfMonth(new Date()))}`} />
      </div>

      <Card className="mt-4" flush>
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-4 py-3">
          <FilterPills active={status} items={[
            { key: "active", label: "Active", href: pill("active"), count: open + inProgress },
            ...WORK_ORDER_STATUSES.map((s) => ({ key: s, label: humanize(s), href: pill(s), count: countOf(s) })),
            { key: "all", label: "All", href: pill("all"), count: total },
          ]} />
          <FilterBar keep={["status"]} filters={[
            { name: "priority", label: "Priority", value: validPriority ?? "", options: WORK_ORDER_PRIORITIES.map((p) => ({ value: p, label: humanize(p) })) },
            { name: "category", label: "Category", value: validCategory ?? "", options: WORK_ORDER_CATEGORIES.map((c) => ({ value: c, label: WORK_ORDER_CATEGORY_LABELS[c] ?? humanize(c) })) },
            { name: "unit", label: "Unit", value: unit ?? "", options: [
              ...trucks.map((t) => ({ value: t.id, label: `${t.unitNumber} · ${t.make} ${t.model}` })),
              ...trailers.map((t) => ({ value: t.id, label: `${t.unitNumber} · trailer` })),
            ] },
          ]} />
        </div>
        <Table head={["#", "Unit", "Work", "Category", "Priority", "Status", "Vendor", "Scheduled", "In / out", "Cost", ""]} empty={rows.length === 0}
          emptyTitle={status === "active" && !filtered ? "No open work orders" : "Nothing matches these filters"}
          emptyDescription={status === "active" && !filtered
            ? (editable ? "Create a work order for a repair, inspection or PM service, or start one from the PM schedule." : "Open work orders will appear here.")
            : "Clear a filter or pick another status."}>
          {rows.map((w) => {
            const shopDays = w.inAt ? daysBetween(w.inAt, w.outAt ?? undefined) : null;
            return (
              <tr key={w.id}>
                <td><Link href={workOrderHref(w.id)} className="num font-medium text-fg hover:underline">#{w.number}</Link></td>
                <td><UnitLink truck={w.truck} trailer={w.trailer} /></td>
                <td className="max-w-80">
                  <Cell primary={<Link href={workOrderHref(w.id)} className="font-medium hover:underline">{w.title}</Link>} secondary={w.description ?? undefined} />
                </td>
                <td className="whitespace-nowrap text-fg-muted">{WORK_ORDER_CATEGORY_LABELS[w.category] ?? humanize(w.category)}</td>
                <td><Priority value={w.priority} /></td>
                <td><Badge value={w.status} dot /></td>
                <td className="max-w-44 truncate text-fg-muted">{w.vendor ?? <span className="text-fg-faint">In-house</span>}</td>
                <td className="whitespace-nowrap text-fg-muted">{date(w.scheduledAt)}</td>
                <td className="whitespace-nowrap">
                  {w.inAt
                    ? <Cell primary={<span className="num text-fg-muted">{date(w.inAt)} → {w.outAt ? date(w.outAt) : <span className="text-warn">in shop</span>}</span>} secondary={shopDays != null ? `${number(shopDays)}d` : undefined} />
                    : <span className="text-fg-faint">—</span>}
                </td>
                <td className="num font-medium">{w.cost ? money(w.cost) : <span className="font-normal text-fg-faint">—</span>}</td>
                <td className="text-right">{editable && <WorkOrderStatusButtons id={w.id} status={w.status} number={w.number} compact />}</td>
              </tr>
            );
          })}
        </Table>
        {rows.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2 text-[11px] text-fg-subtle">
            <span>{finished ? "Most recently completed first." : "In progress first, then open and drafts; urgent work at the top of each group."}</span>
            {rows.length >= PAGE && <span>Showing the first {PAGE}. Narrow the filters to see the rest.</span>}
          </div>
        )}
      </Card>
    </>
  );
}
