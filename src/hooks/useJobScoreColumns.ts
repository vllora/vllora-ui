/**
 * useJobScoreColumns
 *
 * Merges eval + finetune jobs into a unified list of score columns,
 * and provides per-record score lookups across all jobs.
 */

import { useMemo, useContext } from "react";
import { EvalJobsContext } from "@/contexts/EvalJobsContext";
import type { FinetuneJobsContextType } from "@/contexts/FinetuneJobsContext";
import {
  buildJobColumns,
  type JobColumn,
  type RecordJobScore,
} from "@/components/datasets/records-table/job-score-columns";

// Re-create a minimal context reference for optional consumption
// (FinetuneJobsContext is not exported, so we use the Consumer pattern)
import { createContext } from "react";
export const FinetuneJobsCtxRef = createContext<FinetuneJobsContextType | undefined>(undefined);

export interface JobScoreColumnsResult {
  readonly columns: JobColumn[];
  readonly getScoresForRecord: (recordId: string) => ReadonlyMap<string, RecordJobScore>;
  readonly totalColumnCount: number;
}

/**
 * Build job score columns from eval + finetune jobs.
 * Both contexts are optional — if not available, those columns are simply empty.
 */
export function useJobScoreColumns(
  finetuneCtx?: FinetuneJobsContextType,
): JobScoreColumnsResult {
  const evalCtx = useContext(EvalJobsContext);

  const evalJobs = evalCtx?.jobs ?? [];
  const finetuneJobs = finetuneCtx?.filteredJobs ?? [];

  const columns = useMemo(
    () => buildJobColumns(evalJobs, finetuneJobs),
    [evalJobs, finetuneJobs],
  );

  // Build per-record score + reason + rollout lookups for eval jobs (from
  // polling snapshots). rollout_content is the model's actual output for a
  // given record at this eval — the signal the drawer's "Model output"
  // section renders so users can compare against ground truth inline.
  const evalScoresByRecord = useMemo(() => {
    const map = new Map<
      string,
      Map<string, { score: number; reason?: string; rolloutContent?: string }>
    >();

    for (const job of evalJobs) {
      const results = job.pollingSnapshot?.results ?? [];
      for (const result of results) {
        const rowData = result.row;
        const rowId = rowData?.id;
        if (!rowId) continue;

        // Get score from the latest epoch
        const epochs = result.epochs ?? {};
        const epochKeys = Object.keys(epochs).sort();
        const latestEpoch = epochKeys[epochKeys.length - 1];
        if (!latestEpoch) continue;

        const epochEntries = epochs[latestEpoch];
        const entry = Array.isArray(epochEntries) ? epochEntries[0] : undefined;
        if (!entry || entry.score == null) continue;

        const recordScores =
          map.get(rowId) ??
          new Map<string, { score: number; reason?: string; rolloutContent?: string }>();
        recordScores.set(job.id, {
          score: entry.score,
          reason: entry.reason ?? undefined,
          rolloutContent: entry.rollout_content ?? undefined,
        });
        map.set(rowId, recordScores);
      }
    }

    return map;
  }, [evalJobs]);

  // Build per-record score + reason lookups for finetune jobs
  const finetuneScoresByRecord = useMemo(() => {
    const map = new Map<string, Map<string, { score: number; reason?: string }>>();

    if (!finetuneCtx) return map;

    for (const job of finetuneJobs) {
      const evalState = finetuneCtx.getJobEvaluations(job.id);
      const results = evalState.data?.results ?? [];

      for (const result of results) {
        const rowData = result.row;
        const rowId = rowData?.id;
        if (!rowId) continue;

        // Get score from the latest epoch
        const epochs = result.epochs ?? {};
        const epochKeys = Object.keys(epochs).map(Number).sort((a, b) => a - b);
        const latestEpoch = epochKeys[epochKeys.length - 1];
        if (latestEpoch == null) continue;

        const epochEntries = epochs[latestEpoch];
        const entry = Array.isArray(epochEntries) ? epochEntries[0] : undefined;
        if (!entry || entry.score == null) continue;

        const recordScores = map.get(rowId) ?? new Map<string, { score: number; reason?: string }>();
        recordScores.set(job.id, { score: entry.score, reason: entry.reason ?? undefined });
        map.set(rowId, recordScores);
      }
    }

    return map;
  }, [finetuneJobs, finetuneCtx]);

  // Lookup helper: get score entry from either map
  const getEntry = (
    recordId: string,
    colId: string,
    type: "eval" | "finetune",
  ) => {
    return type === "eval"
      ? evalScoresByRecord.get(recordId)?.get(colId)
      : finetuneScoresByRecord.get(recordId)?.get(colId);
  };

  // Also use record.evaluations (per-job map from IndexedDB) as fallback
  const getScoresForRecord = useMemo(() => {
    return (recordId: string): ReadonlyMap<string, RecordJobScore> => {
      const scores = new Map<string, RecordJobScore>();

      for (const col of columns) {
        const entry = getEntry(recordId, col.id, col.type);
        const score = entry?.score;
        const reason = entry?.reason;
        // `rolloutContent` only flows from eval snapshots today (finetune's
        // evalState doesn't include it yet). Casting keeps the plumbing
        // forward-compatible without re-typing the shared lookup map.
        const rolloutContent =
          (entry as { rolloutContent?: string } | undefined)?.rolloutContent;

        // Compute trend: delta from previous column of same type
        let trend: number | undefined;
        if (score !== undefined) {
          const prevCol = columns
            .filter((c) => c.type === col.type && c.createdAt < col.createdAt)
            .pop();
          if (prevCol) {
            const prevEntry = getEntry(recordId, prevCol.id, col.type);
            if (prevEntry?.score !== undefined) {
              trend = score - prevEntry.score;
            }
          }
        }

        scores.set(col.id, {
          score,
          trend,
          reason,
          rolloutContent,
          status: col.status,
        });
      }

      return scores;
    };
  }, [columns, evalScoresByRecord, finetuneScoresByRecord]);

  return {
    columns,
    getScoresForRecord,
    totalColumnCount: columns.length,
  };
}
