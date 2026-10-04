import { format, isSameDay } from "date-fns";
import type { Tone } from "@/components/ui";
import { dateTime } from "@/lib/format";

/* Pure helpers for the driver portal — safe to import from client and server code. */

export const STOP_TONE: Record<string, Tone> = { PENDING: "neutral", ARRIVED: "info", DONE: "ok" };
export const STOP_TYPE_TONE: Record<string, Tone> = { PICKUP: "info", DELIVERY: "accent" };
export const STOP_TYPE_LABEL: Record<string, string> = { PICKUP: "Pickup", DELIVERY: "Delivery" };

export const EVENT_TONE: Record<string, Tone> = {
  CREATED: "neutral", ASSIGNED: "info", STATUS: "progress", EDIT: "neutral", DOCUMENT: "info", BILLING: "accent",
  NOTE: "neutral", CHECK_CALL: "ok", ISSUE: "danger",
};
export const EVENT_LABEL: Record<string, string> = {
  CREATED: "Created", ASSIGNED: "Assigned", STATUS: "Status", EDIT: "Edit", DOCUMENT: "Document", BILLING: "Billing",
  NOTE: "Note", CHECK_CALL: "Check-in", ISSUE: "Issue",
};

/** Message types a driver can send from the portal (addLoadEvent accepts NOTE, CHECK_CALL, ISSUE). */
export const UPDATE_TYPES = [
  { value: "CHECK_CALL", label: "Check-in", placeholder: "e.g. Passed Jizzakh, on schedule" },
  { value: "ISSUE", label: "Issue", placeholder: "e.g. Border queue, 2 h delay expected" },
  { value: "NOTE", label: "Note", placeholder: "e.g. Consignee asked for a 14:00 slot" },
] as const;

/** Turn-by-turn navigation to a stop in the phone's maps app. */
export const navigateUrl = (lat: number, lng: number) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;

/** Per-load chat thread. */
export const chatRoomHref = (loadId: string) => `/chat?room=load:${loadId}`;

export function windowLabel(start: Date | null | undefined, end: Date | null | undefined) {
  if (start && end) {
    return isSameDay(start, end)
      ? `${format(start, "dd MMM")}, ${format(start, "HH:mm")}–${format(end, "HH:mm")}`
      : `${dateTime(start)} – ${dateTime(end)}`;
  }
  if (end) return `By ${dateTime(end)}`;
  if (start) return `From ${dateTime(start)}`;
  return "No appointment window";
}

export function fmtDuration(ms: number) {
  const m = Math.round(Math.abs(ms) / 60_000);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h < 24) return r ? `${h} h ${r} min` : `${h} h`;
  const d = Math.floor(h / 24);
  return `${d} d ${h % 24} h`;
}

/** Monday 00:00 of the week containing `d` (local time). */
export function startOfWeek(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}
export const startOfMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1);

export function greetingFor(hour: number) {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  return "Good evening";
}
