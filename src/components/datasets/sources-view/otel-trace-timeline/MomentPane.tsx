/**
 * MomentPane
 *
 * Replaces agent-prism's built-in `DetailsView` (In/Out · Attributes · Raw)
 * with the skill-first "Moment" layout from the Workflow Redesign mock.
 *
 * A moment is the one span in a trace that produced training signal — the
 * leaf LLM span with prompt + completion, or a successful tool call. We show
 * the moment alongside the records it fed so the user sees trace →
 * training-data linkage in one surface.
 */

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { DatasetRecord } from "@/types/dataset-types";
import type { OtelSemconvSpan } from "../OtelTraceSourceViewer";
import {
  detectMomentFromSpans,
  linkRecordsToMoment,
  type Moment,
  type MomentLinkage,
} from "./moment";

interface MomentPaneProps {
  readonly traceId: string;
  readonly spans: readonly OtelSemconvSpan[];
  readonly records: readonly DatasetRecord[];
}

export function MomentPane({ traceId, spans, records }: MomentPaneProps) {
  const { moment, linkage } = useMemo(() => {
    const traceSpans = spans.filter((s) => s.trace_id === traceId);
    const m = detectMomentFromSpans(traceSpans);
    const spanIds = new Set(traceSpans.map((s) => s.span_id));
    const l = linkRecordsToMoment(records, m, spanIds);
    return { moment: m, linkage: l };
  }, [traceId, spans, records]);

  if (!moment) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground">
        No moment detected — this trace has no LLM completion or successful
        tool call.
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-4">
      <MomentCard moment={moment} linkage={linkage} />
    </div>
  );
}

function MomentCard({ moment, linkage }: { readonly moment: Moment; readonly linkage: MomentLinkage }) {
  return (
    <div className="rounded-lg border border-border/60 bg-zinc-900/30 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-violet-300">
          Moment
        </span>
        <span className="font-mono text-[11.5px] text-foreground">{moment.title}</span>
        <span className="text-muted-foreground/50">·</span>
        <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
          {Math.round(moment.durationMs)}ms
        </span>
        <span className="text-muted-foreground/50">·</span>
        <span className="text-[11px] text-muted-foreground">
          {moment.extractor === "tool-signal" ? "tool call + result" : "prompt + completion"}
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground/70">
          Extracted by{" "}
          <span className="font-mono text-muted-foreground">{moment.extractor}</span>
        </span>
      </div>

      {moment.userQuery && (
        <section className="mt-4">
          <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">
            {moment.userQuery.role === "tool.input" ? "tool.input" : "user.query"}
          </div>
          <p className="mt-1 whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-foreground/90">
            {truncate(moment.userQuery.text, 600)}
          </p>
        </section>
      )}

      {moment.completion && (
        <section className="mt-4">
          <div className="font-mono text-[10px] uppercase tracking-wider text-emerald-300/80">
            {moment.completion.role === "tool.output" ? "tool.output" : "llm.completion"}
          </div>
          <p className="mt-1 whitespace-pre-wrap break-words text-[12.5px] leading-relaxed text-foreground">
            {truncate(moment.completion.text, 600)}
          </p>
        </section>
      )}

      <footer className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/50 pt-3 text-[11px]">
        <span className="text-muted-foreground/70">Informs:</span>
        {linkage.topics.length > 0 ? (
          linkage.topics.slice(0, 3).map((t) => (
            <span
              key={t}
              className="rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[10px] text-foreground"
            >
              <span className="mr-1 text-emerald-400">●</span>
              {t}
            </span>
          ))
        ) : (
          <span className="text-muted-foreground/50">no linked records yet</span>
        )}
        {linkage.topics.length > 3 && (
          <span className="text-[10px] text-muted-foreground/60">
            +{linkage.topics.length - 3} more
          </span>
        )}

        <span className="ml-auto text-[11px] text-muted-foreground">
          This moment feeds{" "}
          <span className="font-semibold text-foreground tabular-nums">
            {linkage.recordCount}
          </span>{" "}
          record{linkage.recordCount === 1 ? "" : "s"}
          {typeof linkage.avgScore === "number" && (
            <>
              {" "}· avg score{" "}
              <span className={cn("font-semibold tabular-nums", scoreTone(linkage.avgScore))}>
                {linkage.avgScore.toFixed(2)}
              </span>
            </>
          )}
        </span>
      </footer>
    </div>
  );
}

function scoreTone(avg: number): string {
  if (avg >= 0.75) return "text-emerald-300";
  if (avg >= 0.5) return "text-amber-300";
  return "text-rose-300";
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}…`;
}
