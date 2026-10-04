import { Megaphone } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { LinkButton, PageHeader } from "@/components/ui";
import { canAccessRoom, chatContext, chatMe, fetchMessages, listRooms, roomMeta } from "@/components/chat/data";
import { COMPANY_ROOM, PAGE_SIZE, parseRoom } from "@/components/chat/shared";
import { ChatWorkspace } from "@/components/chat/workspace";

export const metadata = { title: "Chat" };

/**
 * Team chat: company room, team room(s) and a thread per active load (`?room=load:<id>`, linked from the
 * load page). Everyone with chat.view — drivers included — can open it; room access is checked server-side.
 */
export default async function ChatPage({ searchParams }: PageProps<"/chat">) {
  const user = await requireUser("chat.view");
  const sp = await searchParams;
  const requested = typeof sp.room === "string" && sp.room ? sp.room : COMPANY_ROOM;

  const ctx = await chatContext(user);
  let rooms = await listRooms(ctx);
  let room = requested;
  let notice: string | null = null;

  if (!rooms.some((r) => r.id === room)) {
    // A thread that isn't in the column (e.g. a delivered load opened from its page) is fine if the viewer may read it.
    const meta = (await canAccessRoom(ctx, room)) ? await roomMeta(ctx, room) : null;
    if (meta) {
      const firstLoad = rooms.findIndex((r) => r.kind === "load");
      rooms = meta.kind === "load" && firstLoad >= 0 ? [...rooms.slice(0, firstLoad), meta, ...rooms.slice(firstLoad)] : [...rooms, meta];
    } else {
      notice = parseRoom(room) ? "That thread isn't available to you — showing the company room instead." : "That room doesn't exist — showing the company room instead.";
      room = COMPANY_ROOM;
    }
  }

  const { messages, hasMore } = await fetchMessages(room, { take: PAGE_SIZE });
  const teams = rooms.filter((r) => r.kind === "team").length;
  const loads = rooms.filter((r) => r.kind === "load").length;

  return (
    <div className="flex min-h-[480px] flex-col h-[calc(100dvh-76px)] lg:h-[calc(100dvh-84px)]">
      <PageHeader
        eyebrow="Team"
        title="Chat"
        subtitle={`Company room · ${teams} team ${teams === 1 ? "room" : "rooms"} · ${loads} active load ${loads === 1 ? "thread" : "threads"} · refreshes every 4 s`}
        actions={<LinkButton href="/announcements" variant="secondary"><Megaphone />Announcements</LinkButton>}
      />
      <ChatWorkspace rooms={rooms} active={room} initial={messages} hasMore={hasMore} me={chatMe(user)} notice={notice} />
    </div>
  );
}
