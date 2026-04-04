/**
 * DatasetBreadcrumb
 *
 * Breadcrumb navigation for dataset detail view.
 * Shows path from Datasets list to current dataset with optional dataset selector.
 */

import { ChevronRight, Database } from "lucide-react";
import { DatasetSelector } from "./DatasetSelector";
import type { Dataset } from "@/types/dataset-types";

export interface DatasetBreadcrumbProps {
  name: string;
  workflowId: string;
  datasets?: Dataset[];
  datasetRecordCounts?: Record<string, number>;
  onBack: () => void;
  onSelectDataset?: (workflowId: string) => void;
  onCreateNew: () => void;
  onDropdownOpen?: () => void;
}

export function DatasetBreadcrumb({
  name,
  workflowId,
  datasets,
  datasetRecordCounts,
  onBack,
  onSelectDataset,
  onCreateNew,
  onDropdownOpen,
}: DatasetBreadcrumbProps) {
  return (
    <nav className="flex items-center gap-2 text-sm mb-4">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
      >
        <Database className="w-3.5 h-3.5" />
        <span>Workflows</span>
      </button>
      <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/50" />
      {datasets && datasets.length > 1 && onSelectDataset ? (
        <DatasetSelector
          currentName={name}
          currentId={workflowId}
          datasets={datasets}
          recordCounts={datasetRecordCounts}
          onSelect={onSelectDataset}
          onCreateNew={onCreateNew}
          onOpen={onDropdownOpen}
        />
      ) : (
        <span className="px-2.5 py-1 rounded-md bg-muted/50 text-foreground font-medium">
          {name}
        </span>
      )}
    </nav>
  );
}
