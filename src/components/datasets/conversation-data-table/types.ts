/**
 * Conversation Data Table — Shared types & adapter functions
 *
 * Provides a unified row interface and adapters to convert
 * both DatasetRecord (manage mode) and JSONL strings (read-only mode)
 * into a common format for the table.
 */

import type { DatasetRecord, DatasetEvaluation } from "@/types/dataset-types";
import { extractMessages, cleanText } from "../records-table/cells/ConversationThreadCell.utilities";
import { estimateTokens } from "../records-table/cells/StatsBadge";

// ─── Mode ───

export type ConversationTableMode = "synthetic-data-manage" | "jsonl-read-only";

// ─── Unified row interface ───

export interface ConversationRow {
  readonly id: string;
  readonly index: number;
  readonly system: string;
  readonly user: string;
  readonly assistant: string;
  /** Primary numeric score for display (evaluation score for records, null for JSONL) */
  readonly score: number | null;
  /** Per-job eval scores (JSONL mode only) */
  readonly evalScores?: Readonly<Record<string, number>>;
  /** Estimated token count */
  readonly tokenEstimate: number;
  /** Original DatasetRecord — present only in manage mode */
  readonly record?: DatasetRecord;
  /** Full evaluation object — present only in manage mode */
  readonly evaluation?: DatasetEvaluation;
}

// ─── Adapter: DatasetRecord → ConversationRow ───

export function datasetRecordToRow(record: DatasetRecord, index: number): ConversationRow {
  const msgs = extractMessages(record.data).filter(
    (m) => m.role.toLowerCase() !== "system",
  );

  const systemMsg = extractMessages(record.data).find(
    (m) => m.role.toLowerCase() === "system",
  );

  const userMsg = msgs.find((m) => {
    const r = m.role.toLowerCase();
    return r === "user" || r === "human";
  });
  const assistantMsg = msgs.find((m) => {
    const r = m.role.toLowerCase();
    return r === "assistant" || r === "ai" || r === "model";
  });

  const fallback =
    typeof record.metadata?.skillResponse === "string"
      ? record.metadata.skillResponse
      : undefined;

  const assistantFallback = typeof record.metadata?.skillResponse === "string"
    ? record.metadata.skillResponse
    : undefined;

  // Derive primary score from evaluation
  const evaluation = record.evaluation;
  const dryRunScore = evaluation?.dryRunScore ?? (
    evaluation?.score != null && !evaluation?.finetuneScore ? evaluation.score : undefined
  );
  const primaryScore = dryRunScore ?? evaluation?.finetuneScore ?? null;

  return {
    id: record.id,
    index,
    system: systemMsg ? cleanText(systemMsg.content) : "",
    user: userMsg ? cleanText(userMsg.content) : (msgs[0] ? cleanText(msgs[0].content) : ""),
    assistant: assistantMsg
      ? cleanText(assistantMsg.content)
      : (fallback ? cleanText(fallback) : ""),
    score: primaryScore ?? null,
    tokenEstimate: estimateTokens(record.data, assistantFallback),
    record,
    evaluation,
  };
}

// ─── Adapter: JSONL content → ConversationRow[] + commonSystem ───

export interface ParsedJsonlResult {
  readonly rows: readonly ConversationRow[];
  readonly commonSystem: string;
}

export function parseJsonlContent(content: string): ParsedJsonlResult {
  const lines = content.split("\n").filter((line) => line.trim().length > 0);
  const rows: ConversationRow[] = [];

  for (let i = 0; i < lines.length; i++) {
    try {
      const obj = JSON.parse(lines[i]) as Record<string, unknown>;
      const system = typeof obj.system === "string" ? obj.system : "";
      const user = typeof obj.user === "string" ? obj.user : "";
      const assistant = typeof obj.assistant === "string" ? obj.assistant : "";
      const evalScores =
        obj.eval_scores && typeof obj.eval_scores === "object" && !Array.isArray(obj.eval_scores)
          ? (obj.eval_scores as Record<string, number>)
          : {};

      const totalChars = system.length + user.length + assistant.length;

      rows.push({
        id: String(i + 1),
        index: i + 1,
        system,
        user,
        assistant,
        score: null,
        evalScores,
        tokenEstimate: Math.ceil(totalChars / 4),
      });
    } catch {
      // Skip malformed lines
    }
  }

  // Extract common system prompt (first non-empty one)
  const commonSystem = rows.find((r) => r.system.trim() !== "")?.system ?? "";

  return { rows, commonSystem };
}
