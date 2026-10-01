import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getAlerts } from "@/lib/alerts";
import { AppShell } from "@/components/app-shell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const alerts = can(user.role, "dashboard.view") ? await getAlerts() : [];
  return (
    <AppShell user={{ name: user.name, email: user.email, role: user.role }} alerts={alerts}>
      {children}
    </AppShell>
  );
}
