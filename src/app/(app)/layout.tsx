import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getAlerts } from "@/lib/alerts";
import { db } from "@/lib/db";
import { CLAIM_OPEN_STATUSES } from "@/lib/constants";
import { daysAgo } from "@/lib/format";
import { AppShell } from "@/components/app-shell";
import { AssistantLauncher } from "@/components/assistant/launcher";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const staff = can(user.role, "dashboard.view");
  const [alerts, openClaims, unassigned, pinned] = await Promise.all([
    staff ? getAlerts() : Promise.resolve([]),
    can(user.role, "claims.view") ? db.claim.count({ where: { status: { in: [...CLAIM_OPEN_STATUSES] } } }) : Promise.resolve(0),
    can(user.role, "loads.view") ? db.load.count({ where: { status: "PLANNED", pickupAt: { lte: daysAgo(-1) } } }) : Promise.resolve(0),
    can(user.role, "chat.view") ? db.announcement.count({ where: { pinned: true, OR: [{ expiresAt: null }, { expiresAt: { gt: daysAgo(0) } }] } }) : Promise.resolve(0),
  ]);
  const badges: Record<string, number> = {};
  if (openClaims) badges["/claims"] = openClaims;
  if (unassigned) badges["/dispatch"] = unassigned;
  if (pinned) badges["/announcements"] = pinned;
  const assistant = can(user.role, "assistant.use") && Boolean(process.env.AI_GATEWAY_API_KEY || process.env.ANTHROPIC_API_KEY || process.env.VERCEL);

  return (
    <AppShell user={{ name: user.name, email: user.email, role: user.role }} alerts={alerts} badges={badges}>
      {children}
      <AssistantLauncher enabled={assistant} />
    </AppShell>
  );
}
