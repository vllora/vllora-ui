/**
 * Moment detection + trace→records linkage for the OTel trace timeline.
 *
 * A "moment" is the one span in a trace that produced the training signal —
 * typically the leaf LLM span with both prompt (input messages) and
 * completion (output messages). This is what `otel_distill.py` treats as the
 * record-generating anchor, so we expose it as a first-class object so the
 * timeline can tell the user "this span fed N records · avg score X".
 */

import type { OtelSemconvSpan } from "../OtelTraceSourceViewer";
import type { DatasetRecord } from "@/types/dataset-types";

export interface MomentMessage {
  readonly role: string;
  readonly text: string;
}

export interface Moment {
  readonly spanId: string;
  /** Display title — tool name, model, or span kind. */
  readonly title: string;
  readonly durationMs: number;
  readonly extractor: "completion-signal" | "tool-signal";
  /** Last user turn before the completion (prompt slice). */
  readonly userQuery?: MomentMessage;
  /** Assistant completion (or tool result). */
  readonly completion?: MomentMessage;
}

export interface MomentLinkage {
  readonly recordCount: number;
  readonly avgScore?: number;
  readonly topics: readonly string[];
}

export interface TraceSummary {
  readonly traceId: string;
  readonly spans: readonly OtelSemconvSpan[];
  readonly durationMs: number;
  readonly startMs: number;
  /** Human label — tool name, root operation, or "trace". */
  readonly skill: string;
  /** Primary operation category driving the status dot color. */
  readonly category: "llm" | "tool" | "agent" | "mixed" | "other";
  readonly hasError: boolean;
  readonly moment: Moment | null;
  readonly endpoint?: string;
  readonly model?: string;
}

function toEpochMs(ts: string | undefined): number {
  if (!ts) return 0;
  if (/^\d{16,}$/.test(ts)) return Math.floor(Number(BigInt(ts) / 1_000_000n));
  const ms = Date.parse(ts);
  return Number.isNaN(ms) ? 0 : ms;
}

function attrString(attrs: Record<string, unknown> | undefined, key: string): string | undefined {
  const v = attrs?.[key];
  return typeof v === "string" ? v : undefined;
}

function extractLastUserText(messages: unknown): MomentMessage | undefined {
  if (!Array.isArray(messages)) return undefined;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const msg = messages[i];
    if (typeof msg !== "object" || !msg) continue;
    const m = msg as Record<string, unknown>;
    const role = String(m.role ?? "");
    if (role !== "user") continue;
    const parts = Array.isArray(m.parts) ? m.parts : [];
    const text = parts
      .filter((p): p is Record<string, unknown> => typeof p === "object" && p != null)
      .filter((p) => p.type === "text" && typeof p.content === "string")
      .map((p) => p.content as string)
      .join("\n");
    if (text.trim()) return { role, text };
  }
  return undefined;
}

function extractAssistantText(messages: unknown): MomentMessage | undefined {
  if (!Array.isArray(messages)) return undefined;
  const lines: string[] = [];
  let toolCallCount = 0;
  for (const msg of messages) {
    if (typeof msg !== "object" || !msg) continue;
    const m = msg as Record<string, unknown>;
    const role = String(m.role ?? "");
    if (role !== "assistant") continue;
    const parts = Array.isArray(m.parts) ? m.parts : [];
    for (const p of parts) {
      if (typeof p !== "object" || !p) continue;
      const part = p as Record<string, unknown>;
      if (part.type === "text" && typeof part.content === "string") {
        lines.push(part.content);
      } else if (part.type === "tool_call") {
        toolCallCount += 1;
      }
    }
  }
  const text = lines.join("\n").trim();
  if (text) return { role: "assistant", text };
  if (toolCallCount > 0) {
    return { role: "assistant", text: `[${toolCallCount} tool call${toolCallCount === 1 ? "" : "s"}]` };
  }
  return undefined;
}

export function detectMomentFromSpans(spans: readonly OtelSemconvSpan[]): Moment | null {
  // Prefer the last LLM span that has an output. That's usually the
  // decision-making completion rather than a fan-out sub-call.
  const llmSpans = spans
    .filter((s) => {
      const op = attrString(s.attributes, "gen_ai.operation.name");
      return op === "chat" || op === "text_completion";
    })
    .filter((s) => s.attributes?.["gen_ai.output.messages"] != null);

  const chosen = llmSpans[llmSpans.length - 1];
  if (chosen) {
    const attrs = chosen.attributes ?? {};
    const startMs = toEpochMs(chosen.start_time);
    const endMs = toEpochMs(chosen.end_time);
    return {
      spanId: chosen.span_id,
      title: attrString(attrs, "gen_ai.request.model") ?? "chat",
      durationMs: Math.max(0, endMs - startMs),
      extractor: "completion-signal",
      userQuery: extractLastUserText(attrs["gen_ai.input.messages"]),
      completion: extractAssistantText(attrs["gen_ai.output.messages"]),
    };
  }

  // Fallback: a tool execution with both args and result — captures
  // skill-only traces where the signal is a successful tool invocation.
  const toolSpans = spans.filter((s) => {
    const op = attrString(s.attributes, "gen_ai.operation.name");
    return op === "execute_tool"
      && s.attributes?.["gen_ai.tool.call.arguments"] != null
      && s.attributes?.["gen_ai.tool.call.result"] != null;
  });
  const toolChosen = toolSpans[toolSpans.length - 1];
  if (toolChosen) {
    const attrs = toolChosen.attributes ?? {};
    const startMs = toEpochMs(toolChosen.start_time);
    const endMs = toEpochMs(toolChosen.end_time);
    const args = attrs["gen_ai.tool.call.arguments"];
    const result = attrs["gen_ai.tool.call.result"];
    return {
      spanId: toolChosen.span_id,
      title: attrString(attrs, "gen_ai.tool.name") ?? "tool",
      durationMs: Math.max(0, endMs - startMs),
      extractor: "tool-signal",
      userQuery: {
        role: "tool.input",
        text: typeof args === "string" ? args : JSON.stringify(args, null, 2),
      },
      completion: {
        role: "tool.output",
        text: typeof result === "string" ? result : JSON.stringify(result, null, 2),
      },
    };
  }

  return null;
}

function pickCategory(spans: readonly OtelSemconvSpan[]): TraceSummary["category"] {
  let hasLlm = false;
  let hasTool = false;
  let hasAgent = false;
  for (const s of spans) {
    const op = attrString(s.attributes, "gen_ai.operation.name");
    if (op === "chat" || op === "text_completion") hasLlm = true;
    else if (op === "execute_tool") hasTool = true;
    else if (op === "invoke_agent") hasAgent = true;
  }
  if (hasLlm && hasTool) return "mixed";
  if (hasLlm) return "llm";
  if (hasTool) return "tool";
  if (hasAgent) return "agent";
  return "other";
}

function pickSkill(spans: readonly OtelSemconvSpan[]): { skill: string; endpoint?: string; model?: string } {
  const root = spans.find((s) => !s.parent_span_id) ?? spans[0];
  const rootAttrs = root?.attributes ?? {};

  const rootOp = attrString(rootAttrs, "gen_ai.operation.name");
  const agentName = attrString(rootAttrs, "agent.name");
  const rootTool = attrString(rootAttrs, "gen_ai.tool.name");
  const endpoint = attrString(rootAttrs, "http.route") ?? attrString(rootAttrs, "http.target");
  const firstLlm = spans.find((s) => {
    const op = attrString(s.attributes, "gen_ai.operation.name");
    return op === "chat" || op === "text_completion";
  });
  const model = attrString(firstLlm?.attributes, "gen_ai.request.model");

  let skill: string;
  if (rootOp === "invoke_agent" && agentName) skill = agentName;
  else if (rootOp === "execute_tool" && rootTool) skill = rootTool;
  else if (rootOp === "chat" && model) skill = model;
  else if (rootOp) skill = rootOp;
  else skill = "trace";

  return { skill, endpoint, model };
}

export function buildTraceSummaries(spans: readonly OtelSemconvSpan[]): TraceSummary[] {
  const byTrace = new Map<string, OtelSemconvSpan[]>();
  for (const s of spans) {
    const arr = byTrace.get(s.trace_id) ?? [];
    arr.push(s);
    byTrace.set(s.trace_id, arr);
  }

  const out: TraceSummary[] = [];
  for (const [traceId, traceSpans] of byTrace) {
    let minStart = Number.POSITIVE_INFINITY;
    let maxEnd = 0;
    let hasError = false;
    for (const s of traceSpans) {
      const start = toEpochMs(s.start_time);
      const end = toEpochMs(s.end_time);
      if (start && start < minStart) minStart = start;
      if (end > maxEnd) maxEnd = end;
      if (s.status_code === "ERROR") hasError = true;
    }
    if (!Number.isFinite(minStart)) minStart = 0;

    const { skill, endpoint, model } = pickSkill(traceSpans);
    out.push({
      traceId,
      spans: traceSpans,
      durationMs: Math.max(0, maxEnd - minStart),
      startMs: minStart,
      skill,
      endpoint,
      model,
      category: pickCategory(traceSpans),
      hasError,
      moment: detectMomentFromSpans(traceSpans),
    });
  }

  // Most recent first
  return out.sort((a, b) => (b.startMs || 0) - (a.startMs || 0));
}

function getRecordScore(r: DatasetRecord): number | undefined {
  const e = r.evaluation;
  if (!e) return undefined;
  if (typeof e.dryRunAvg === "number") return e.dryRunAvg;
  if (typeof e.evalScore === "number") return e.evalScore;
  if (typeof e.score === "number") return e.score;
  return undefined;
}

export function linkRecordsToMoment(
  records: readonly DatasetRecord[],
  moment: Moment | null,
  allSpanIds: ReadonlySet<string>,
): MomentLinkage {
  if (!moment) {
    const linked = records.filter((r) => r.spanId && allSpanIds.has(r.spanId));
    return summarizeLinkage(linked);
  }
  // Prefer records bound directly to the moment span; fall back to any
  // record whose span is inside this trace (coarser but still useful when
  // moment detection picked a different leaf than the distiller did).
  const direct = records.filter((r) => r.spanId === moment.spanId);
  if (direct.length > 0) return summarizeLinkage(direct);
  const loose = records.filter((r) => r.spanId && allSpanIds.has(r.spanId));
  return summarizeLinkage(loose);
}

function summarizeLinkage(records: readonly DatasetRecord[]): MomentLinkage {
  const scores: number[] = [];
  const topics = new Set<string>();
  for (const r of records) {
    const s = getRecordScore(r);
    if (typeof s === "number") scores.push(s);
    if (r.topic) {
      const leaf = r.topic.split("/").pop();
      if (leaf) topics.add(leaf);
    }
  }
  const avg = scores.length === 0
    ? undefined
    : scores.reduce((a, b) => a + b, 0) / scores.length;
  return {
    recordCount: records.length,
    avgScore: avg,
    topics: Array.from(topics),
  };
}

export function formatRelativeTime(startMs: number, nowMs: number = Date.now()): string {
  if (!startMs) return "—";
  const diffSec = Math.max(0, Math.round((nowMs - startMs) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}
