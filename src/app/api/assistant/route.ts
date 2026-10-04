import { NextResponse } from "next/server";
import { APICallError, createAgentUIStreamResponse, NoSuchModelError } from "ai";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { assistantModelId, createFleetAgent, isAssistantConfigured } from "@/lib/assistant/agent";
import { NOT_CONFIGURED_CODE, NOT_CONFIGURED_MESSAGE, type AssistantErrorBody } from "@/lib/assistant/shared";

export const dynamic = "force-dynamic";
/** Tool round trips plus a long answer can take a while on a cold model. */
export const maxDuration = 60;

/** Only the recent turns go to the model; the client keeps the full transcript. */
const HISTORY_LIMIT = 30;
const NO_STORE = { "cache-control": "no-store" };

const fail = (status: number, error: string, code?: string) =>
  NextResponse.json<AssistantErrorBody>({ error, code }, { status, headers: NO_STORE });

/** What the user sees when the model call or a tool fails. Never leaks stack traces or provider payloads. */
function describe(error: unknown): string {
  if (APICallError.isInstance(error)) {
    if (error.statusCode === 401 || error.statusCode === 403) return "The AI Gateway rejected the credentials — check AI_GATEWAY_API_KEY.";
    if (error.statusCode === 429) return "The model is rate limited right now. Try again in a minute.";
    if (error.statusCode && error.statusCode >= 500) return "The model provider is having trouble. Try again in a moment.";
  }
  if (NoSuchModelError.isInstance(error)) return `The model "${assistantModelId()}" isn't available on the gateway — check ASSISTANT_MODEL.`;
  const msg = error instanceof Error ? error.message : "";
  if (/AI_GATEWAY_API_KEY|OIDC|api key|unauthori[sz]ed/i.test(msg)) return "The AI Gateway rejected the credentials — check AI_GATEWAY_API_KEY.";
  if (/abort/i.test(msg)) return "The answer was stopped.";
  return "The assistant couldn't finish that answer. Try again, or ask it a different way.";
}

/**
 * POST /api/assistant — body `{ messages: UIMessage[] }` from `useChat`.
 * Streams a UI message stream (text, tool activity, finish) for the Fleet Assistant.
 * 401 signed out · 403 role lacks assistant.use · 503 no gateway credentials · 400 bad body.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return fail(401, "Sign in required", "UNAUTHENTICATED");
  if (!can(user.role, "assistant.use")) return fail(403, "Your role can't use the fleet assistant", "FORBIDDEN");
  if (!isAssistantConfigured()) return fail(503, NOT_CONFIGURED_MESSAGE, NOT_CONFIGURED_CODE);

  let body: { messages?: unknown };
  try {
    body = (await req.json()) as { messages?: unknown };
  } catch {
    return fail(400, "Send JSON with a messages array", "BAD_REQUEST");
  }
  const messages = Array.isArray(body?.messages) ? body.messages : null;
  if (!messages || messages.length === 0) return fail(400, "Send at least one message", "BAD_REQUEST");

  const agent = createFleetAgent({ role: user.role, name: user.name });
  try {
    return await createAgentUIStreamResponse({
      agent,
      uiMessages: messages.slice(-HISTORY_LIMIT),
      sendReasoning: false,
      headers: NO_STORE,
      onError: (error) => {
        console.error("[assistant]", user.email, error instanceof Error ? error.message : error);
        return describe(error);
      },
    });
  } catch (error) {
    // Thrown before the stream starts: malformed UI messages, model resolution, provider setup.
    console.error("[assistant] failed to start", user.email, error);
    const msg = error instanceof Error ? error.message : "";
    if (/invalid|validation|parts|role/i.test(msg) && !/api key/i.test(msg)) return fail(400, "The conversation payload isn't valid. Clear the chat and try again.", "BAD_REQUEST");
    return fail(500, describe(error), "ASSISTANT_ERROR");
  }
}
