/**
 * PerRowDetailsSection
 *
 * Displays per-row evaluation details for finetune training.
 * Uses the shared ResultsTable with expand support — clicking a row
 * reveals the EpochScoresTable showing score progression across epochs.
 */

import { useMemo, useState, useCallback } from "react";
import type { FinetuneEvalResultsResponse, FlatEvaluationResult } from "@/services/finetune-api";
import {
  parseScoreBreakdown,
  getAllCriteriaNames,
} from "@/utils/parse-score-breakdown";
import { ResultsTable } from "@/components/datasets/dry-run-dialog/ResultsTable";
import { EpochScoresTable, type EpochScore } from "./EpochScoresTable";

interface PerRowDetailsSectionProps {
  results: FinetuneEvalResultsResponse["results"];
}

interface RowEpochData {
  epochs: EpochScore[];
  criteriaNames: string[];
}

export function PerRowDetailsSection({ results }: PerRowDetailsSectionProps) {
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

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

      // Latest epoch for the flat table row
      const latestEpoch = epochNumbers[epochNumbers.length - 1];
      const latestResults = row.epochs[latestEpoch];
      const latestResult = latestResults?.[0];

      const rowId = row.row?.id ?? `finetune-row-${row.row_index}`;

      flat.push({
        dataset_row_id: rowId,
        row_index: row.row_index,
        row: row.row ?? undefined,
        status: latestResult?.status ?? "completed",
        score: latestResult?.score ?? undefined,
        reason: latestResult?.reason ?? undefined,
        logs: latestResult?.logs ?? undefined,
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

  return (
    <ResultsTable
      results={flatResults}
      fillHeight
      expandedRowId={expandedRowId}
      onRowClick={handleRowClick}
      renderExpandedContent={renderExpandedContent}
    />
  );
}
