/**
 * DatasetDetailView
 *
 * Displays all records for a selected dataset with full functionality.
 * Uses DatasetDetailContext to manage state and reduce prop drilling.
 */

import { DatasetDetailProvider } from "@/contexts/DatasetDetailContext";
import { FinetuneJobsProvider } from "@/contexts/FinetuneJobsContext";
import { DatasetDetailContentV2 } from "./DatasetDetailContentV2";

interface DatasetDetailViewProps {
  datasetId: string;
  onBack: () => void;
  /** Called when user selects a different dataset from the dropdown */
  onSelectDataset?: (datasetId: string) => void;
}

export function DatasetDetailView({ datasetId, onBack, onSelectDataset }: DatasetDetailViewProps) {
  return (
    <DatasetDetailProvider
      datasetId={datasetId}
      onBack={onBack}
      onSelectDataset={onSelectDataset}
    >
      <FinetuneJobsProvider>
        <DatasetDetailContentV2 />
      </FinetuneJobsProvider>
    </DatasetDetailProvider>
  );
}
