import type { Tone } from "@/components/ui";

/** Where an audit entry's entity lives. Entities without a detail page link to their list. */
const ENTITY_HREF: Record<string, (id: string) => string> = {
  load: (id) => `/loads/${id}`,
  truck: (id) => `/fleet/${id}`,
  trailer: () => "/fleet/trailers",
  driver: (id) => `/drivers/${id}`,
  customer: (id) => `/customers/${id}`,
  invoice: (id) => `/finance/invoices/${id}`,
  user: (id) => `/admin/users/${id}`,
  team: () => "/admin/company",
  company: () => "/admin/company",
  workOrder: (id) => `/maintenance/work-orders/${id}`,
  work_order: (id) => `/maintenance/work-orders/${id}`,
  claim: (id) => `/claims/${id}`,
  announcement: () => "/announcements",
  system: () => "/admin/telegram",
};

export function entityHref(entity: string, entityId: string | null | undefined): string | null {
  const fn = ENTITY_HREF[entity];
  if (!fn) return null;
  if (!entityId && entity !== "trailer" && entity !== "team" && entity !== "company" && entity !== "system" && entity !== "announcement") return null;
  return fn(entityId ?? "");
}

export const ENTITY_LABELS: Record<string, string> = {
  load: "Load", truck: "Truck", trailer: "Trailer", driver: "Driver", customer: "Customer", invoice: "Invoice", user: "User",
  team: "Team", company: "Company", workOrder: "Work order", work_order: "Work order", claim: "Claim", document: "Document",
  announcement: "Announcement", system: "System", payment: "Payment", board: "Board", chat: "Chat",
};
export const entityLabel = (e: string) => ENTITY_LABELS[e] ?? e.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** Action verb → tone. Anything unknown is neutral. */
const ACTION_TONE: Record<string, Tone> = {
  create: "ok", upload: "ok", assign: "info", update: "info", team: "info", status: "progress", recover: "progress",
  delete: "danger", hold: "warn", release: "ok", login: "neutral", change_password: "neutral",
  unlink_telegram: "warn", unlink_telegram_group: "warn", telegram_webhook: "info", void: "danger", pay: "ok", send: "info",
};
export const actionTone = (a: string): Tone => ACTION_TONE[a] ?? "neutral";
export const actionLabel = (a: string) => a.replace(/_/g, " ");
