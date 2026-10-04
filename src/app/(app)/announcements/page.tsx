import { MessageSquare } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { ago, dateTime, toLocalInput } from "@/lib/format";
import { Card, EmptyState, LinkButton, PageHeader, Segmented, cn } from "@/components/ui";
import { AnnouncementForm } from "./form";
import { AnnouncementItem } from "./item";
import { expiresSoon, isExpired, type AnnouncementDTO } from "./shared";

export const metadata = { title: "Announcements" };

/**
 * Company announcements: pinned first, then recent; expired ones hidden unless asked for.
 * Everyone with chat.view reads; owner / admin (announcements.manage) post, edit, pin and delete.
 */
export default async function AnnouncementsPage({ searchParams }: PageProps<"/announcements">) {
  const user = await requireUser("chat.view");
  const sp = await searchParams;
  const showExpired = sp.expired === "1";
  const manage = can(user.role, "announcements.manage");
  const loadLinks = can(user.role, "loads.view");

  const all = await db.announcement.findMany({ orderBy: [{ pinned: "desc" }, { createdAt: "desc" }], include: { author: { select: { name: true } } } });
  const toDTO = (a: (typeof all)[number]): AnnouncementDTO => ({
    id: a.id, title: a.title, body: a.body, pinned: a.pinned, author: a.author?.name ?? "Former user",
    createdLabel: dateTime(a.createdAt), agoLabel: ago(a.createdAt),
    expiresInput: toLocalInput(a.expiresAt), expiresLabel: a.expiresAt ? dateTime(a.expiresAt) : null,
    expired: isExpired(a.expiresAt), expiresSoon: expiresSoon(a.expiresAt),
  });

  const live = all.filter((a) => !isExpired(a.expiresAt));
  const expired = all.filter((a) => isExpired(a.expiresAt)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const pinned = live.filter((a) => a.pinned).map(toDTO);
  const recent = live.filter((a) => !a.pinned).map(toDTO);
  const old = showExpired ? expired.map(toDTO) : [];
  const groups = [
    { key: "pinned", label: "Pinned", items: pinned },
    { key: "recent", label: "Recent", items: recent },
    { key: "expired", label: "Expired", items: old },
  ].filter((g) => g.items.length);
  const total = pinned.length + recent.length + old.length;

  return (
    <>
      <PageHeader
        eyebrow="Team"
        title="Announcements"
        subtitle={`${pinned.length} pinned · ${recent.length} recent${expired.length ? ` · ${expired.length} expired` : ""}`}
        actions={
          <>
            <Segmented active={showExpired ? "all" : "live"} items={[
              { key: "live", href: "/announcements", label: "Current", count: live.length },
              { key: "all", href: "/announcements?expired=1", label: "Show expired", count: expired.length },
            ]} />
            <LinkButton href="/chat" variant="secondary"><MessageSquare />Open chat</LinkButton>
          </>
        }
      />

      <div className={cn("grid gap-4", manage ? "xl:grid-cols-[minmax(0,1fr)_360px]" : "max-w-3xl")}>
        <div className="space-y-3">
          {total === 0 ? (
            <Card>
              <EmptyState
                title={showExpired ? "No announcements yet" : "No current announcements"}
                description={manage
                  ? "Post the first one with the form — pin it so it stays at the top for everyone, drivers included."
                  : expired.length ? "Everything posted so far has expired. Use “Show expired” to read it." : "Nothing to read right now. Pinned announcements show here first when the team posts them."}
              />
            </Card>
          ) : (
            groups.map((g) => (
              <section key={g.key} className="space-y-2" aria-label={g.label}>
                {groups.length > 1 && <p className="eyebrow pt-1">{g.label} <span className="num">{g.items.length}</span></p>}
                {g.items.map((a) => <AnnouncementItem key={a.id} a={a} canManage={manage} loadLinks={loadLinks} />)}
              </section>
            ))
          )}
        </div>
        {manage && (
          <div className="space-y-4 xl:sticky xl:top-16 xl:self-start">
            <Card title="New announcement">
              <AnnouncementForm />
            </Card>
            <p className="px-1 text-[11px] leading-4 text-fg-subtle">
              Pinned announcements stay at the top and count on the sidebar badge. Set an expiry for anything time-boxed — border queues, shop closures — so the list stays current without clean-up.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
