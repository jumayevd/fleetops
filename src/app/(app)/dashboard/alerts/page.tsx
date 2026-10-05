import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getAlerts } from "@/lib/alerts";
import { Badge, Card, EmptyState, FilterPills, LinkButton, PageHeader, StatusDot, Table } from "@/components/ui";
import { KINDS, KIND_LABEL, groupAlerts, isKind, plural, visibleAlerts } from "../lib";

export const metadata = { title: "Needs you" };

const HIDDEN_TITLE = "The alerts bell counts every open exception. Only the ones your role can open are listed here.";

/** Every open exception, grouped by kind. The "Needs you" strip on the overview links here. */
export default async function AlertsPage({ searchParams }: PageProps<"/dashboard/alerts">) {
  const user = await requireUser("dashboard.view");
  const sp = await searchParams;
  const kind = isKind(sp.kind) ? sp.kind : undefined;

  const raw = await getAlerts();
  const alerts = visibleAlerts(raw, user.role);
  const hidden = raw.length - alerts.length;
  const groups = groupAlerts(alerts);
  const critical = alerts.filter((a) => a.level === "critical").length;
  const shown = kind ? groups.filter((g) => g.kind === kind) : groups;
  const rows = shown.flatMap((g) => g.items.map((a) => ({ ...a, group: g })));

  const pills = [
    { key: "all", href: "/dashboard/alerts", label: "All", count: alerts.length },
    ...KINDS.map((k) => ({ key: k, href: `/dashboard/alerts?kind=${k}`, label: KIND_LABEL[k], count: groups.find((g) => g.kind === k)?.items.length ?? 0 })),
  ].filter((p) => p.key === "all" || p.count > 0);

  const hiddenNote = hidden > 0 && <span title={HIDDEN_TITLE}> · {hidden} hidden for your role</span>;

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/dashboard" className="hover:text-fg">Overview</Link>}
        title="Needs you"
        subtitle={alerts.length
          ? <>{plural(alerts.length, "exception")} · {critical} critical · {plural(alerts.length - critical, "warning")}{hiddenNote}</>
          : <>No open exceptions{hidden > 0 ? " for your role" : ""}{hiddenNote}</>}
      />
      {pills.length > 1 && <div className="mb-4"><FilterPills items={pills} active={kind ?? "all"} /></div>}

      <Card flush>
        {rows.length === 0 ? (
          kind && alerts.length ? (
            <EmptyState
              title={`No ${KIND_LABEL[kind].toLowerCase()} exceptions`}
              description="Other kinds still have open exceptions."
              action={<LinkButton href="/dashboard/alerts" variant="secondary" size="sm">Show all</LinkButton>}
            />
          ) : (
            <EmptyState title="All clear" description="Nothing needs a decision right now. Exceptions appear here as compliance dates approach, loads run late, invoices age or claims stay open." />
          )
        ) : (
          <Table dense head={["Level", "Kind", "What", "Detail", <span key="open" className="sr-only">Open</span>]}>
            {rows.map((a, i) => (
              <tr key={`${a.href}-${i}`}>
                <td className="whitespace-nowrap">
                  <Badge value={a.level === "critical" ? "CRITICAL" : "HIGH"} label={a.level === "critical" ? "Critical" : "Warning"} dot />
                </td>
                <td className="whitespace-nowrap text-fg-muted">
                  <span className="inline-flex items-center gap-1.5"><StatusDot tone={a.group.tone} />{a.group.label}</span>
                </td>
                <td className="font-medium text-fg"><Link href={a.href} className="hover:text-accent-text">{a.title}</Link></td>
                <td className="max-w-md truncate text-fg-muted" title={a.detail}>{a.detail}</td>
                <td className="whitespace-nowrap text-right"><Link href={a.href} className="text-[12px] font-medium text-fg-muted hover:text-fg">Open →</Link></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
