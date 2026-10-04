import { differenceInMinutes, format, isSameDay, isToday, isYesterday } from "date-fns";

/* Client-safe types and helpers shared by the chat page, the thread component, the action and the API. */

export type RoomKind = "company" | "team" | "load";
export type ParsedRoom = { kind: "company" } | { kind: "team"; teamId: string } | { kind: "load"; loadId: string };

export const COMPANY_ROOM = "company";
export const MAX_BODY = 2000;
export const POLL_MS = 4000;
export const PAGE_SIZE = 100;
/** Consecutive messages by the same author within this window are drawn as one group. */
const GROUP_MINUTES = 5;

/** "company" | "team:<id>" | "load:<id>" → structured room, or null when malformed. */
export function parseRoom(room: string | null | undefined): ParsedRoom | null {
  if (!room || room === COMPANY_ROOM) return { kind: "company" };
  const m = /^(team|load):([a-zA-Z0-9_-]{1,64})$/.exec(room);
  if (!m) return null;
  return m[1] === "team" ? { kind: "team", teamId: m[2] } : { kind: "load", loadId: m[2] };
}

export type ChatMessageDTO = {
  id: string;
  room: string;
  userId: string | null;
  userName: string;
  body: string;
  /** ISO timestamp. */
  createdAt: string;
  /** Optimistic append awaiting the server. */
  pending?: boolean;
  /** The server rejected it (kept visible so the author can retry). */
  failed?: boolean;
};

export type RoomSummary = {
  /** The room key: "company", "team:<id>", "load:<id>". */
  id: string;
  kind: RoomKind;
  name: string;
  /** Route for loads, member count for teams, "Everyone" for the company room. */
  subtitle: string | null;
  /** Load status, for the tone dot. */
  status: string | null;
  /** Where the entity lives (load page), if the viewer can open it. */
  href: string | null;
  lastAt: string | null;
  lastPreview: string | null;
  lastBy: string | null;
};

export type ChatMe = { id: string; name: string; canViewLoads: boolean };

/** Shape returned by GET /api/chat. */
export type ChatApiResponse = { room: string; me: ChatMe; messages: ChatMessageDTO[]; hasMore: boolean; serverTime: string };

/* ------------------------------------------------------------------ */
/* Last-seen store (localStorage, per room)                            */
/* ------------------------------------------------------------------ */

const SEEN_KEY = "fleetops.chat.lastSeen";
const seenListeners = new Set<() => void>();

export function readSeenRaw(): string {
  try { return localStorage.getItem(SEEN_KEY) ?? ""; } catch { return ""; }
}
export function parseSeen(raw: string): Record<string, string> {
  if (!raw) return {};
  try {
    const v: unknown = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, string>) : {};
  } catch { return {}; }
}
/** Record that the viewer has seen everything in `room` up to `at` (ISO). Never moves backwards. */
export function markSeen(room: string, at: string) {
  const cur = parseSeen(readSeenRaw());
  if (cur[room] && cur[room] >= at) return;
  cur[room] = at;
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(cur)); } catch { /* storage unavailable */ }
  seenListeners.forEach((l) => l());
}
export function subscribeSeen(cb: () => void) {
  seenListeners.add(cb);
  const onStorage = (e: StorageEvent) => { if (e.key === SEEN_KEY) cb(); };
  window.addEventListener("storage", onStorage);
  return () => { seenListeners.delete(cb); window.removeEventListener("storage", onStorage); };
}
export const isUnread = (room: RoomSummary, seen: Record<string, string>) =>
  Boolean(room.lastAt) && (!seen[room.id] || seen[room.id] < (room.lastAt as string));

/* ------------------------------------------------------------------ */
/* Presentation helpers                                                 */
/* ------------------------------------------------------------------ */

export type MessageGroup = { key: string; userId: string | null; userName: string; at: string; items: ChatMessageDTO[] };
export type DaySection = { key: string; label: string; groups: MessageGroup[] };

export function dayLabel(d: Date, now = new Date()) {
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  const days = Math.round((now.getTime() - d.getTime()) / 86_400_000);
  return days < 7 ? format(d, "EEEE d MMM") : format(d, "dd MMM yyyy");
}
export const timeLabel = (iso: string) => format(new Date(iso), "HH:mm");
export const fullTimeLabel = (iso: string) => format(new Date(iso), "dd MMM yyyy, HH:mm");
/** For the rooms column: time today, otherwise a short date. */
export function shortWhen(iso: string, now = new Date()) {
  const d = new Date(iso);
  return isSameDay(d, now) ? format(d, "HH:mm") : format(d, "dd MMM");
}

/** Split into day sections, each with author groups (same author, within 5 minutes). */
export function sectionize(messages: ChatMessageDTO[], now = new Date()): DaySection[] {
  const out: DaySection[] = [];
  for (const m of messages) {
    const d = new Date(m.createdAt);
    let day = out[out.length - 1];
    if (!day || !isSameDay(new Date(day.key), d)) {
      day = { key: d.toISOString(), label: dayLabel(d, now), groups: [] };
      out.push(day);
    }
    const g = day.groups[day.groups.length - 1];
    const last = g?.items[g.items.length - 1];
    if (g && last && g.userId === m.userId && !last.failed && !m.failed && Math.abs(differenceInMinutes(d, new Date(last.createdAt))) < GROUP_MINUTES) {
      g.items.push(m);
    } else {
      day.groups.push({ key: m.id, userId: m.userId, userName: m.userName, at: m.createdAt, items: [m] });
    }
  }
  return out;
}

export const byCreatedAt = (a: ChatMessageDTO, b: ChatMessageDTO) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0);

export const firstName = (name: string | null | undefined) => (name ? name.split(/\s+/)[0] : "Someone");

/** One-line preview for the rooms column. */
export const previewOf = (body: string, max = 80) => {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
};
