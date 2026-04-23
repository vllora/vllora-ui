/**
 * MomentTraceList
 *
 * Custom trace list matching the Workflow Redesign spec. Each row shows:
 *   ● 4-4 id  [M]                          {duration}ms
 *   {endpoint or skill in mono}
 *   {subtitle}                             {time ago}
 *
 * Design alignment notes:
 * - Selected row uses violet accent (#a78bfa) — the mock reserves emerald
 *   for the *moment-producing span*, not trace selection.
 * - Dot color is derived per-skill (stable palette) so scanning the list
 *   shows which skill produced each trace at a glance.
 * - M badge shows whenever the trace has an extractable moment — matching
 *   the mock's `moment: true` flag, not a record-linkage gate.
 * - Duration stays muted (`fg-3` analogue) by default and only turns rose
 *   on error; no threshold-based amber tint.
 */

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  buildTraceSummaries,
  formatRelativeTime,
  type TraceSummary,
} from "./moment";
import type { OtelSemconvSpan } from "../OtelTraceSourceViewer";

interface MomentTraceListProps {
  readonly rawSpans: readonly OtelSemconvSpan[];
  readonly selectedTraceId: string | undefined;
  readonly onTraceSelect: (traceId: string) => void;
}

/**
 * Stable per-skill palette — the mock uses these four hues for
 * explain-move / suggest-hint / evaluate-pos / game-review. We hash the
 * skill name into the palette so every distinct skill lands on the same
 * color across renders, matching that "skill-at-a-glance" affordance.
 */
const SKILL_PALETTE = [
  "#a78bfa", // violet
  "#60a5fa", // blue
  "#f59e0b", // amber
  "#10b981", // emerald
  "#f472b6", // pink
  "#22d3ee", // cyan
] as const;

function hashToIndex(key: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < key.length; i += 1) {
    h = (h * 31 + key.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % mod;
}

function dotColor(summary: TraceSummary): string {
  if (summary.hasError) return "#fb7185"; // rose-400
  return SKILL_PALETTE[hashToIndex(summary.skill, SKILL_PALETTE.length)];
}

function durationToneClass(summary: TraceSummary): string {
  if (summary.hasError) return "text-rose-300";
  return "text-muted-foreground";
}

function formatShortId(traceId: string): string {
  const clean = traceId.replace(/-/g, "");
  return `${clean.slice(0, 4)}-${clean.slice(4, 8)}`;
}

/**
 * Third row caption — secondary context for the trace. Falls back so each
 * field is only shown once per card (no duplicate "gpt-4o / gpt-4o"):
 *   - endpoint present → show skill (service/agent name)
 *   - skill is the model → show span count
 *   - otherwise → show model
 */
function subtitleFor(t: TraceSummary): string {
  if (t.endpoint) return t.skill;
  if (t.model && t.model !== t.skill) return t.model;
  return `${t.spans.length} span${t.spans.length === 1 ? "" : "s"}`;
}

/**
 * Query syntax (matches design's `skill:x status:y id:abc` placeholder):
 *   - `skill:<substr>` — skill name contains substr (case-insensitive)
 *   - `status:error`   — only traces with at least one error span
 *   - `status:ok`      — only traces with no error
 *   - `id:<substr>`    — trace id contains substr
 *   - bare words       — full-text match on skill / endpoint / id
 */
function matchesQuery(t: TraceSummary, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const tokens = q.split(/\s+/);
  for (const tok of tokens) {
    const colon = tok.indexOf(":");
    if (colon > 0) {
      const key = tok.slice(0, colon);
      const value = tok.slice(colon + 1);
      if (key === "skill" && !t.skill.toLowerCase().includes(value)) return false;
      else if (key === "status" && value === "error" && !t.hasError) return false;
      else if (key === "status" && value === "ok" && t.hasError) return false;
      else if (key === "id" && !t.traceId.toLowerCase().includes(value)) return false;
    } else {
      const hay = `${t.skill} ${t.endpoint ?? ""} ${t.traceId} ${t.model ?? ""}`.toLowerCase();
      if (!hay.includes(tok)) return false;
    }
  }
  return true;
}

export function MomentTraceList({
  rawSpans,
  selectedTraceId,
  onTraceSelect,
}: MomentTraceListProps) {
  const [query, setQuery] = useState("");
  const summaries = useMemo(() => buildTraceSummaries(rawSpans), [rawSpans]);
  const filtered = useMemo(
    () => summaries.filter((t) => matchesQuery(t, query)),
    [summaries, query],
  );

  return (
    <aside className="flex h-full flex-col">
      <header className="flex flex-col gap-1.5 border-b border-border/60 px-3 py-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
            Trace timeline
          </span>
          <span className="rounded bg-muted/40 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground tabular-nums">
            {filtered.length === summaries.length
              ? summaries.length
              : `${filtered.length}/${summaries.length}`}
          </span>
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="skill:… status:error …"
          className="h-7 w-full rounded border border-border/60 bg-background/40 px-2 font-mono text-[10.5px] text-foreground placeholder:text-muted-foreground/60 focus:border-violet-400/60 focus:outline-none"
        />
      </header>

      {summaries.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-4 text-xs text-muted-foreground">
          No traces in this bundle.
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-4 text-xs text-muted-foreground">
          No traces match <span className="ml-1 font-mono text-foreground">{query}</span>
        </div>
      ) : (
      <ul className="flex-1 overflow-y-auto">
        {filtered.map((t) => {
          const isSelected = t.traceId === selectedTraceId;
          return (
            <li key={t.traceId}>
              <button
                type="button"
                onClick={() => onTraceSelect(t.traceId)}
                className={cn(
                  "flex w-full flex-col gap-[5px] border-l-2 border-b border-border/30 px-[14px] py-[10px] text-left transition-colors",
                  isSelected
                    ? "border-l-[#a78bfa] bg-[rgba(167,139,250,0.08)]"
                    : "border-l-transparent hover:bg-muted/30",
                )}
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: dotColor(t) }}
                  />
                  <span className="font-mono text-[10.5px] text-muted-foreground">
                    {formatShortId(t.traceId)}
                  </span>
                  {t.moment && (
                    <span
                      title="Moment extracted — distiller can pull training signal from this trace"
                      className="rounded bg-violet-500/15 px-1 py-px text-[9px] font-semibold uppercase tracking-[0.04em] text-violet-300"
                    >
                      M
                    </span>
                  )}
                  <span
                    className={cn(
                      "ml-auto font-mono text-[10.5px] tabular-nums",
                      durationToneClass(t),
                    )}
                  >
                    {Math.round(t.durationMs)}ms
                  </span>
                </div>

                <div className="truncate font-mono text-[11px] text-foreground">
                  {t.endpoint ?? t.skill}
                </div>

                <div className="flex items-center justify-between gap-2 text-[10.5px] text-muted-foreground/60">
                  <span className="truncate">{subtitleFor(t)}</span>
                  <span className="shrink-0 tabular-nums">
                    {formatRelativeTime(t.startMs)}
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
      )}
    </aside>
  );
}
