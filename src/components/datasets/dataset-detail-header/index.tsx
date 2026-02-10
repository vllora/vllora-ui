/**
 * DatasetDetailHeader
 *
 * Simplified header showing dataset objective and key statistics in cards.
 * Consumes DatasetDetailContext to avoid prop drilling.
 */

import { DatasetDetailConsumer } from "@/contexts/DatasetDetailContext";
import { EditableTitle } from "./EditableTitle";
import { WorkflowStepIndicator } from "./WorkflowStepIndicator";

export function DatasetDetailHeader() {
  const {
    dataset,
    datasetId,
    records,
    handleRenameDataset,
    setDryRunDialog,
  } = DatasetDetailConsumer();

  return (
    <div className="w-full flex flex-col">
      {/* Title Row */}
      <EditableTitle
        value={dataset?.name ?? ""}
        onSave={handleRenameDataset}
        className="mb-3"
      />

      {/* Objective with Workflow Checklist */}
      <div className="flex items-start gap-6">
        {/* Objective */}
        {dataset?.datasetObjective && (
          <p className="flex-1 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Objective:</span>{" "}
            {dataset.datasetObjective}
          </p>
        )}

        {/* Workflow Checklist */}
        <WorkflowStepIndicator
          datasetId={datasetId}
          className="shrink-0"
          variant="checklist"
          hasRecords={records.length > 0}
          hasEvalFunction={!!dataset?.evalScript}
          onEvalConfigClick={() => setDryRunDialog(true)}
        />
      </div>
    </div>
  );
}
