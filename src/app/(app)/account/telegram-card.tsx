import { Send } from "lucide-react";
import { db } from "@/lib/db";
import { getBot, telegramConfigured } from "@/lib/telegram";
import { disconnectTelegram, sendMeTest, setTelegramAlerts, startTelegramLink } from "@/app/actions/telegram";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Badge, Card, buttonClass } from "@/components/ui";

const WHAT: Record<string, string> = {
  OWNER: "issues, deliveries, payments, maintenance and the daily brief",
  ADMIN: "issues, deliveries, maintenance and the daily brief",
  DISPATCHER: "load status changes, driver issues, PODs and the daily brief",
  FLEET_MANAGER: "maintenance and the daily brief",
  ACCOUNTANT: "deliveries, uploaded PODs and payments",
  DRIVER: "new trip assignments and cancellations",
};

export async function TelegramCard({ userId }: { userId: string }) {
  if (!telegramConfigured()) {
    return <Card title="Telegram alerts"><p className="text-sm text-slate-500">Telegram alerts haven&apos;t been set up yet. Ask an administrator to configure the bot.</p></Card>;
  }
  const u = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const bot = await getBot().catch(() => null);

  return (
    <Card title="Telegram alerts" actions={u.telegramChatId ? <Badge value="ACTIVE" label="Connected" /> : null}>
      <p className="mb-4 text-sm text-slate-600">Get {WHAT[u.role] ?? "alerts"} on Telegram.</p>
      {u.telegramChatId ? (
        <div className="space-y-3">
          <form action={setTelegramAlerts.bind(null, !u.telegramAlerts)}>
            <label className="flex items-center gap-2 text-sm">
              <button className={`relative h-5 w-9 rounded-full transition ${u.telegramAlerts ? "bg-blue-600" : "bg-slate-300"}`} aria-label="Toggle alerts">
                <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${u.telegramAlerts ? "left-4" : "left-0.5"}`} />
              </button>
              {u.telegramAlerts ? "Alerts on" : "Alerts paused"}
            </label>
          </form>
          <div className="flex flex-wrap gap-2">
            <ActionForm action={sendMeTest}><SubmitButton variant="secondary" size="sm" pendingText="Sending…">Send test</SubmitButton></ActionForm>
            <form action={disconnectTelegram}><button className={buttonClass("ghost", "sm") + " text-rose-600"}>Disconnect</button></form>
          </div>
        </div>
      ) : u.telegramLinkCode && bot ? (
        <div className="space-y-3">
          <a href={`https://t.me/${bot.username}?start=${u.telegramLinkCode}`} target="_blank" rel="noreferrer" className={buttonClass("primary")}>
            <Send className="h-4 w-4" />Open @{bot.username} and press Start
          </a>
          <p className="text-xs text-slate-500">After pressing <b>Start</b> in Telegram, refresh this page. The link works once.</p>
        </div>
      ) : (
        <form action={startTelegramLink}>
          <button className={buttonClass("primary")}><Send className="h-4 w-4" />Connect Telegram</button>
          {!bot && <p className="mt-2 text-xs text-rose-600">Bot is unreachable — check TELEGRAM_BOT_TOKEN.</p>}
        </form>
      )}
    </Card>
  );
}
