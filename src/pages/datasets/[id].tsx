/**
 * DatasetDetailPage
 *
 * Page component for viewing a single dataset's details.
 * Accessed via /datasets/:workflowId route.
 */

import { useParams, useNavigate } from "react-router";
import { DatasetsUIProvider } from "@/contexts/DatasetsUIContext";
import { DatasetDetailView } from "@/components/datasets/DatasetDetailView";

function DatasetDetailPageContent() {
  const { workflowId } = useParams<{ workflowId: string }>();
  const navigate = useNavigate();

  if (!workflowId) {
    navigate("/finetune");
    return null;
  }

  const handleBack = () => {
    navigate("/finetune");
  };

  const handleSelectDataset = (newDatasetId: string) => {
    navigate(`/finetune/${newDatasetId}`);
  };


  return (
    <DatasetDetailView
      workflowId={workflowId}
      onBack={handleBack}
      onSelectDataset={handleSelectDataset}
    />
  );
}

export function DatasetDetailPage() {
  return (
    <section className="flex-1 flex overflow-hidden bg-background text-foreground relative">
      <div className="flex-1 flex flex-col overflow-hidden">
        <DatasetsUIProvider>
          <DatasetDetailPageContent />
        </DatasetsUIProvider>
      </div>
    </section>
  );
}
