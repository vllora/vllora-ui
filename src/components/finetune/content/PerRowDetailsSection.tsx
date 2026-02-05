/**
 * PerRowDetailsSection
 *
 * Displays per-row evaluation details for training metrics.
 */

import { useMemo, useState } from "react";
import type { FinetuneEvalResultsResponse } from "@/services/finetune-api";
import {
  parseScoreBreakdown,
  getAllCriteriaNames,
  type ScoreBreakdown,
} from "@/utils/parse-score-breakdown";
import { RowDetailCard, type RowData } from "./RowDetailCard";
import { extractConversation } from "./utils";

interface PerRowDetailsSectionProps {
  results: FinetuneEvalResultsResponse["results"];
}

export function PerRowDetailsSection({ results }: PerRowDetailsSectionProps) {
  const [selectedRow, setSelectedRow] = useState<number | null>(null);

  // Process data for row details
  const { rowData, criteriaNames } = useMemo(() => {
    const epochMap = new Map<number, { breakdowns: ScoreBreakdown[] }>();
    const rowDataList: RowData[] = [];

    for (const row of results) {
      const rowEpochs: RowData["epochs"] = [];
      const { inputMessages, outputMessage } = extractConversation(row.row);

      for (const [epochStr, evalResults] of Object.entries(row.epochs)) {
        const epoch = parseInt(epochStr, 10);

        if (!epochMap.has(epoch)) {
          epochMap.set(epoch, { breakdowns: [] });
        }
        const epochStats = epochMap.get(epoch)!;

        for (const result of evalResults) {
          const breakdown = parseScoreBreakdown(result.reason);

          if (typeof result.score === "number") {
            epochStats.breakdowns.push(breakdown);

            rowEpochs.push({
              epoch,
              score: result.score,
              breakdown,
            });
          }
        }
      }

      rowDataList.push({
        rowIndex: row.row_index,
        inputMessages,
        outputMessage,
        epochs: rowEpochs.sort((a, b) => a.epoch - b.epoch),
      });
    }

    const criteriaNamesList = getAllCriteriaNames(
      Array.from(epochMap.values()).flatMap((s) => s.breakdowns)
    );

    return {
      rowData: rowDataList,
      criteriaNames: criteriaNamesList,
    };
  }, [results]);

  if (rowData.length === 0) {
    return (
      <div className="text-xs text-muted-foreground py-2">
        No row data available
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-[400px] overflow-y-auto">
      {rowData.map((row) => (
        <RowDetailCard
          key={row.rowIndex}
          row={row}
          isExpanded={selectedRow === row.rowIndex}
          onToggle={() =>
            setSelectedRow(selectedRow === row.rowIndex ? null : row.rowIndex)
          }
          criteriaNames={criteriaNames}
        />
      ))}
    </div>
  );
}
