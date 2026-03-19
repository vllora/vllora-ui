/**
 * PerRowDetailsSection
 *
 * Displays per-row evaluation details for finetune training.
 * Uses the shared ResultsTable with expand support — clicking a row
 * reveals the EpochScoresTable showing score progression across epochs.
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import type { FinetuneEvalResultsResponse, FlatEvaluationResult } from "@/services/finetune-api";
import {
  parseScoreBreakdown,
  getAllCriteriaNames,
} from "@/utils/parse-score-breakdown";
import { ResultsTable } from "@/components/datasets/eval-dialog/ResultsTable";
import { EpochScoresTable, type EpochScore } from "./EpochScoresTable";
import { DatasetDetailConsumer } from "@/contexts/DatasetDetailContext";
import { emitter } from "@/utils/eventEmitter";


interface PerRowDetailsSectionProps {
  results: FinetuneEvalResultsResponse["results"];
  /** Dataset ID for navigation (click record ID → switch to Records tab) */
  workflowId?: string;
}

interface RowEpochData {
  epochs: EpochScore[];
  criteriaNames: string[];
}

/** Compute score trend between latest and previous eval checkpoint.
 *  Uses mean of all candidate scores per checkpoint (consistent with how training algorithms use rewards).
 *  Returns trend, prevScore (mean), currentScore (mean), and candidate counts for tooltip. */
function computeEpochTrend(
  epochs: Record<number, { score?: number }[]>,
  sortedEpochNumbers: readonly number[],
): { trend: number; prevScore: number; currentScore: number; prevCount: number; currentCount: number; prevScores: number[]; currentScores: number[] } | undefined {
  if (sortedEpochNumbers.length < 2) return undefined;

  const latestEpoch = sortedEpochNumbers[sortedEpochNumbers.length - 1];
  const prevEpoch = sortedEpochNumbers[sortedEpochNumbers.length - 2];

  const latestScores = (epochs[latestEpoch] ?? []).map(e => e.score).filter((s): s is number => s != null);
  const prevScores = (epochs[prevEpoch] ?? []).map(e => e.score).filter((s): s is number => s != null);

  if (latestScores.length === 0 || prevScores.length === 0) return undefined;

  const latestMean = latestScores.reduce((a, b) => a + b, 0) / latestScores.length;
  const prevMean = prevScores.reduce((a, b) => a + b, 0) / prevScores.length;

  return {
    trend: latestMean - prevMean,
    prevScore: prevMean,
    currentScore: latestMean,
    prevCount: prevScores.length,
    currentCount: latestScores.length,
    prevScores,
    currentScores: latestScores,
  };
}

export function PerRowDetailsSection({ results, workflowId }: PerRowDetailsSectionProps) {
  const { sortedRecords } = DatasetDetailConsumer();
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  // Auto-expand row when navigating from QualityIndicator finetune score click
  useEffect(() => {
    const handleHighlight = (e: Event) => {
      const recordId = (e as CustomEvent).detail?.recordId;
      if (recordId) setExpandedRowId(recordId);
    };
    window.addEventListener('vllora_highlight_eval_result', handleHighlight);
    return () => window.removeEventListener('vllora_highlight_eval_result', handleHighlight);
  }, []);

  // Flatten latest epoch per row for the table, keep all epochs for expand
  const { flatResults, epochDataMap } = useMemo(() => {
    const flat: FlatEvaluationResult[] = [];
    const epochMap = new Map<string, RowEpochData>();

    for (const row of results) {
      const epochNumbers = Object.keys(row.epochs).map(Number).sort((a, b) => a - b);
      if (epochNumbers.length === 0) continue;

      // Collect all epoch data for the expand content
      const rowEpochs: EpochScore[] = [];
      for (const epochNum of epochNumbers) {
        const evalResults = row.epochs[epochNum];
        for (const result of evalResults) {
          if (typeof result.score === "number") {
            const breakdown = parseScoreBreakdown(result.reason);
            rowEpochs.push({
              epoch: epochNum,
              score: result.score,
              breakdown,
              logs: result.logs,
            });
          }
        }
      }

      // Latest epoch for the flat table row — use best score among candidates
      const latestEpoch = epochNumbers[epochNumbers.length - 1];
      const latestResults = row.epochs[latestEpoch];
      const latestResult = latestResults && latestResults.length > 1
        ? [...latestResults].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0]
        : latestResults?.[0];

      const rowId = row.row?.id ?? `finetune-row-${row.row_index}`;

      // Compute trend: score diff between latest and previous epoch (best candidates)
      const trendData = computeEpochTrend(row.epochs, epochNumbers);

      flat.push({
        dataset_row_id: rowId,
        row_index: row.row_index,
        row: row.row ?? undefined,
        status: latestResult?.status ?? "completed",
        score: trendData?.currentScore ?? latestResult?.score ?? undefined,
        reason: latestResult?.reason ?? undefined,
        logs: latestResult?.logs ?? undefined,
        epoch: latestEpoch,
        trend: trendData?.trend,
        trendPrevScores: trendData?.prevScores,
        trendCurrentScores: trendData?.currentScores,
      });

      const criteriaNames = getAllCriteriaNames(rowEpochs.map(e => e.breakdown));
      epochMap.set(rowId, { epochs: rowEpochs, criteriaNames });
    }

    return { flatResults: flat, epochDataMap: epochMap };
  }, [results]);

  const handleRowClick = useCallback((result: FlatEvaluationResult) => {
    setExpandedRowId(prev => prev === result.dataset_row_id ? null : result.dataset_row_id);
  }, []);

  const renderExpandedContent = useCallback((result: FlatEvaluationResult) => {
    const data = epochDataMap.get(result.dataset_row_id);
    if (!data || data.epochs.length === 0) return null;
    return <EpochScoresTable epochs={data.epochs} criteriaNames={data.criteriaNames} />;
  }, [epochDataMap]);

  if (flatResults.length === 0) {
    return (
      <div className="text-xs text-muted-foreground py-2">
        No row data available
      </div>
    );
  }

  const handleNavigateToRecord = useCallback((_cloudRowId: string, result: FlatEvaluationResult) => {
    const gatewayId = (result?.row?.id ?? _cloudRowId) as string;
    const record = sortedRecords.find(r => r.id === gatewayId);
    if (record?.topic && workflowId) {
      window.dispatchEvent(new CustomEvent("vllora_navigate_to_job", {
        detail: { jobId: record.topic, type: "topic" },
      }));
    } else if (workflowId) {
      emitter.emit('vllora_navigate_to_record', { workflowId, recordId: gatewayId });
    }
  }, [sortedRecords, workflowId]);

  return (
    <ResultsTable
      results={flatResults}
      expandedRowId={expandedRowId}
      onRowClick={handleRowClick}
      renderExpandedContent={renderExpandedContent}
      onNavigateToRecord={handleNavigateToRecord}
      fillHeight
    />
  );
}
