import { Badge, StatusDot, type Tone } from "@/components/ui";
import { claimStatusLabel } from "../shared";

/** Pre-formatted on the server so no Date crosses the RSC boundary. */
export type TimelineItem = { id: string; action: string; details: string | null; user: string | null; at: string; ago: string };

const ACTION_TONE: Record<string, Tone> = { create: "ok", status: "progress", assign: "info", update: "neutral", note: "neutral", delete: "danger" };
const ACTION_LABEL: Record<string, string> = { create: "Filed", status: "Status", assign: "Assigned", update: "Edited", note: "Note", delete: "Deleted" };

/** Status history from the audit log (entity "claim"), oldest first. Status entries render the new status as a badge. */
export function ClaimTimeline({ items }: { items: TimelineItem[] }) {
  if (items.length === 0) return <p className="px-4 py-6 text-center text-[12px] text-fg-muted">Nothing has happened on this claim yet.</p>;
  return (
    <ol className="relative">
      {items.map((e, i) => {
        const tone = ACTION_TONE[e.action] ?? "neutral";
        const m = e.action === "status" ? e.details?.match(/^(?:[^:]*: )?(\w+) → (\w+)(.*)$/) : null;
        const last = i === items.length - 1;
        return (
          <li key={e.id} className="relative flex items-start gap-3 px-4 py-2.5">
            {!last && <span aria-hidden className="absolute left-[21px] top-6 bottom-0 w-px bg-line" />}
            <StatusDot tone={tone} className="mt-[6px] ring-4 ring-surface" />
            <div className="min-w-0 flex-1">
              {m ? (
                <p className="flex flex-wrap items-center gap-1.5 text-[13px] text-fg">
                  <Badge value={m[1]} label={claimStatusLabel(m[1])} />
                  <span className="text-fg-faint">→</span>
                  <Badge value={m[2]} label={claimStatusLabel(m[2])} dot />
                  {m[3]?.trim() && <span className="text-[12px] text-fg-muted">{m[3].replace(/^\s*[·—-]\s*/, "")}</span>}
                </p>
              ) : (
                <p className="text-[13px] text-fg">
                  <span className={last && i === 0 ? "font-medium" : undefined}>{ACTION_LABEL[e.action] ?? e.action.replace(/_/g, " ")}</span>
                  {e.details && <span className="text-fg-muted"> · {e.details}</span>}
                </p>
              )}
              <p className="truncate text-[11px] text-fg-subtle">{e.user ?? "System"} · <span className="num">{e.at}</span> · {e.ago}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
