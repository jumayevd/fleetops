import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ROLE_LABELS, type Role } from "@/lib/constants";
import { getBot, getWebhookInfo, telegramConfigured } from "@/lib/telegram";
import { SETTING_GROUP_CHAT, SETTING_GROUP_CODE } from "@/lib/notify";
import { disconnectGroup, newGroupCode, registerWebhook, sendDigestNow } from "@/app/actions/telegram";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, PageHeader, Table, buttonClass } from "@/components/ui";

export const metadata = { title: "Telegram" };

const Step = ({ n, title, children }: { n: number; title: string; children: React.ReactNode }) => (
  <li className="flex gap-3">
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">{n}</span>
    <div className="text-sm"><p className="font-medium text-slate-800">{title}</p><div className="mt-1 text-slate-600">{children}</div></div>
  </li>
);

export default async function TelegramAdmin() {
  await requireUser("users.manage");
  const configured = telegramConfigured();
  const [bot, hook, settings, linked] = await Promise.all([
    configured ? getBot().catch(() => null) : null,
    configured ? getWebhookInfo().catch(() => null) : null,
    db.appSetting.findMany({ where: { key: { in: [SETTING_GROUP_CHAT, SETTING_GROUP_CODE] } } }),
    db.user.findMany({ where: { telegramChatId: { not: null } }, orderBy: { name: "asc" }, select: { id: true, name: true, role: true, telegramAlerts: true } }),
  ]);
  const group = settings.find((s) => s.key === SETTING_GROUP_CHAT)?.value;
  const groupCode = settings.find((s) => s.key === SETTING_GROUP_CODE)?.value;

  return (
    <>
      <PageHeader title="Telegram alerts" subtitle="Push operational alerts to your team's phones and to a company group chat." />
      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card title="Setup">
            <ol className="space-y-5">
              <Step n={1} title="Create the bot">
                In Telegram, message <b>@BotFather</b> → <code>/newbot</code>, then put the token in the <code>TELEGRAM_BOT_TOKEN</code> environment variable and redeploy.
                <div className="mt-2">{configured
                  ? bot ? <Badge value="ACTIVE" label={`Connected as @${bot.username}`} /> : <Badge value="CANCELLED" label="Token set but bot unreachable" />
                  : <Badge value="PLANNED" label="Not configured" />}</div>
              </Step>
              <Step n={2} title="Connect the webhook">
                Lets the bot receive <code>/start</code> links and commands. Run this from the deployed site.
                {configured && (
                  <div className="mt-2 space-y-2">
                    {hook?.url ? <p className="break-all text-xs text-emerald-700">✓ {hook.url}</p> : <p className="text-xs text-amber-700">Not connected yet</p>}
                    {hook?.last_error_message && <p className="text-xs text-rose-600">Last error: {hook.last_error_message}</p>}
                    <ActionForm action={registerWebhook}><SubmitButton size="sm" variant="secondary">{hook?.url ? "Reconnect webhook" : "Connect webhook"}</SubmitButton></ActionForm>
                  </div>
                )}
              </Step>
              <Step n={3} title="Each person links their account">
                Everyone opens <b>My account → Connect Telegram</b>. They then get alerts for their role: drivers get new trips, dispatchers get issues and status changes, accountants get PODs and payments.
              </Step>
              <Step n={4} title="Optional: company group chat">
                Add @{bot?.username ?? "your_bot"} to a group, then send the command below in that group. The group receives all operations alerts and the daily brief.
                <div className="mt-2 space-y-2">
                  {group ? (
                    <div className="flex items-center gap-3"><Badge value="ACTIVE" label="Group connected" />
                      <form action={disconnectGroup}><button className={buttonClass("ghost", "sm") + " text-rose-600"}>Disconnect</button></form></div>
                  ) : groupCode ? (
                    <code className="block rounded-lg bg-slate-900 px-3 py-2 text-sm text-emerald-300">/connect {groupCode}</code>
                  ) : (
                    <form action={newGroupCode}><button className={buttonClass("secondary", "sm")} disabled={!configured}>Generate connect code</button></form>
                  )}
                </div>
              </Step>
            </ol>
          </Card>
          <Card title={`Linked people (${linked.length})`} bodyClassName="p-0">
            <Table head={["Name", "Role", "Alerts"]} empty={linked.length === 0}>
              {linked.map((u) => (
                <tr key={u.id}><td className="font-medium">{u.name}</td><td>{ROLE_LABELS[u.role as Role]}</td>
                  <td>{u.telegramAlerts ? <Badge value="ACTIVE" label="On" /> : <Badge value="OFF_DUTY" label="Paused" />}</td></tr>
              ))}
            </Table>
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="What gets sent">
            <ul className="space-y-2 text-sm text-slate-600">
              <li>🚨 Driver-reported issues → dispatch, admins, group</li>
              <li>🚚✅ Pickup / delivery / cancellation → dispatch, group (+ billing on delivery)</li>
              <li>📋 New trip assigned → the driver</li>
              <li>📎 POD / CMR / customs uploaded → dispatch and billing</li>
              <li>💰 Invoice paid → owner and accountants</li>
              <li>🔧 Truck into / out of the shop → fleet and dispatch</li>
              <li>☀️ Daily brief at 08:00 (Tashkent) → management, group</li>
            </ul>
          </Card>
          <Card title="Daily brief">
            <p className="mb-3 text-sm text-slate-600">Runs automatically each morning via Vercel Cron. Send one now to test.</p>
            <ActionForm action={sendDigestNow}><SubmitButton variant="secondary" size="sm" pendingText="Sending…">Send brief now</SubmitButton></ActionForm>
          </Card>
          <Card title="Bot commands">
            <ul className="space-y-1 text-sm"><li><code>/status</code> live summary (staff only)</li><li><code>/stop</code> mute this chat</li><li><code>/help</code></li></ul>
          </Card>
        </div>
      </div>
    </>
  );
}
