/**
 * DatasetDetailView
 *
 * Displays all records for a selected dataset with full functionality.
 * Uses DatasetDetailContext to manage state and reduce prop drilling.
 */

import { DatasetDetailProvider } from "@/contexts/DatasetDetailContext";
import { FinetuneJobsProvider } from "@/contexts/FinetuneJobsContext";
import { KnowledgeSourcesProvider } from "@/contexts/KnowledgeSourcesContext";
import { PlanProvider } from "@/contexts/PlanContext";
import { DatasetDetailContentV2 } from "./DatasetDetailContentV2";

interface DatasetDetailViewProps {
  workflowId: string;
  onBack: () => void;
  /** Called when user selects a different dataset from the dropdown */
  onSelectDataset?: (workflowId: string) => void;
}

export function DatasetDetailView({ workflowId, onBack, onSelectDataset }: DatasetDetailViewProps) {
  return (
    <DatasetDetailProvider
      workflowId={workflowId}
      onBack={onBack}
      onSelectDataset={onSelectDataset}
    >
      <FinetuneJobsProvider>
        <KnowledgeSourcesProvider workflowId={workflowId}>
          <PlanProvider workflowId={workflowId}>
            <DatasetDetailContentV2 />
          </PlanProvider>
        </KnowledgeSourcesProvider>
      </FinetuneJobsProvider>
    </DatasetDetailProvider>
  );
}
