/**
 * DatasetDetailHeader
 *
 * Simplified header showing dataset title and objective.
 * Consumes DatasetDetailContext to avoid prop drilling.
 */

import { DatasetDetailConsumer } from "@/contexts/DatasetDetailContext";
import { EditableTitle } from "./EditableTitle";

export function DatasetDetailHeader() {
  const { dataset, handleRenameDataset } = DatasetDetailConsumer();

  return (
    <div className="w-full flex flex-col">
      {/* Title */}
      <div className="flex items-center gap-4 mb-3">
        <EditableTitle
          value={dataset?.name ?? ""}
          onSave={handleRenameDataset}
        />
      </div>

      {/* Objective */}
      {dataset?.datasetObjective && (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Objective:</span>{" "}
          {dataset.datasetObjective}
        </p>
      )}
    </div>
  );
}
