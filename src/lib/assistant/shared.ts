/**
 * Fleet Assistant — client-safe constants and helpers. No server imports here: the launcher
 * ("use client") imports from this file, and so do the agent and the API route.
 */

export const ASSISTANT_API = "/api/assistant";
/** sessionStorage key for the panel's open state (survives navigation and reloads, not a new tab). */
export const ASSISTANT_OPEN_KEY = "fleetops.assistant.open";
/** Stable chat id so the conversation survives closing and reopening the panel. */
export const ASSISTANT_CHAT_ID = "fleet-assistant";

export const NOT_CONFIGURED_CODE = "NOT_CONFIGURED";
export const NOT_CONFIGURED_MESSAGE = "Assistant isn't configured — add AI_GATEWAY_API_KEY";

/** JSON body the API returns when it cannot stream an answer. */
export type AssistantErrorBody = { error: string; code?: string };

export const SUGGESTED_PROMPTS = [
  "Which trucks are idle right now?",
  "What's running late?",
  "What can we invoice today?",
  "Who is on hold and why?",
  "Trucks overdue for PM",
] as const;

/** Quiet activity lines shown in the chat while / after a tool runs. */
export const TOOL_LABELS: Record<string, { doing: string; done: string }> = {
  fleetStatus: { doing: "Checking fleet status", done: "Checked fleet status" },
  listTrucks: { doing: "Looking up trucks", done: "Looked up trucks" },
  listDrivers: { doing: "Looking up drivers", done: "Looked up drivers" },
  lateLoads: { doing: "Checking what's running late", done: "Checked what's running late" },
  loadsByStatus: { doing: "Listing loads", done: "Listed loads" },
  findLoad: { doing: "Opening the load", done: "Opened the load" },
  billingQueue: { doing: "Checking the billing queue", done: "Checked the billing queue" },
  receivables: { doing: "Checking receivables", done: "Checked receivables" },
  openClaims: { doing: "Checking open claims", done: "Checked open claims" },
  maintenanceDue: { doing: "Checking service due", done: "Checked service due" },
  weeklyProduction: { doing: "Reading the weekly board", done: "Read the weekly board" },
  alerts: { doing: "Reading alerts", done: "Read alerts" },
  searchEverything: { doing: "Searching FleetOps", done: "Searched FleetOps" },
};

export type ToolActivityState = "doing" | "done" | "error";

export function toolLabel(name: string, state: ToolActivityState) {
  const l = TOOL_LABELS[name];
  const human = name.replace(/([A-Z])/g, " $1").toLowerCase().trim();
  if (state === "error") return `Couldn't ${l ? l.doing.charAt(0).toLowerCase() + l.doing.slice(1) : `run ${human}`}`;
  if (!l) return state === "done" ? `Ran ${human}` : `Running ${human}…`;
  return state === "done" ? l.done : `${l.doing}…`;
}

export type AssistantErrorKind = "not-configured" | "unauthorised" | "generic";

/**
 * Turn a transport / stream error into something the panel can show. The HTTP transport puts the
 * response body in `error.message` (and `responseBody`), so a JSON error from the route is parsed here.
 */
export function describeAssistantError(error: unknown): { kind: AssistantErrorKind; message: string } {
  const raw = (error as { responseBody?: string } | undefined)?.responseBody
    ?? (error instanceof Error ? error.message : typeof error === "string" ? error : "");
  const body = parseErrorBody(raw);
  if (body?.code === NOT_CONFIGURED_CODE || /AI_GATEWAY_API_KEY/i.test(raw)) {
    return { kind: "not-configured", message: NOT_CONFIGURED_MESSAGE };
  }
  const status = (error as { statusCode?: number } | undefined)?.statusCode;
  if (status === 401 || status === 403 || body?.code === "FORBIDDEN" || body?.code === "UNAUTHENTICATED") {
    return { kind: "unauthorised", message: body?.error ?? "Your session can't use the assistant. Sign in again." };
  }
  if (body?.error) return { kind: "generic", message: body.error };
  // Stream errors arrive as plain text written by the route's onError (already user-safe).
  if (raw && raw.length <= 200 && !/^\s*[{[<]/.test(raw) && !/fetch|network|TypeError/i.test(raw)) return { kind: "generic", message: raw };
  return { kind: "generic", message: "The assistant couldn't answer that. Try again in a moment." };
}

function parseErrorBody(raw: string): AssistantErrorBody | null {
  if (!raw || raw[0] !== "{") return null;
  try {
    const v = JSON.parse(raw) as Partial<AssistantErrorBody>;
    return typeof v?.error === "string" ? { error: v.error, code: typeof v.code === "string" ? v.code : undefined } : null;
  } catch {
    return null;
  }
}
