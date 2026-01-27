/**
 * DatasetDetailPage
 *
 * Page component for viewing a single dataset's details.
 * Accessed via /datasets/:datasetId route.
 */

import { useParams, useNavigate } from "react-router";
import { DatasetsUIProvider } from "@/contexts/DatasetsUIContext";
import { DatasetDetailView } from "@/components/datasets/DatasetDetailView";
import { FinetuneDatasetPage } from "@/components/finetune/FinetuneDatasetPage";
import { useSearchParams } from "react-router-dom";

function DatasetDetailPageContent() {
  const { datasetId } = useParams<{ datasetId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const viewMode = searchParams.get("mode");

  if (!datasetId) {
    navigate("/datasets");
    return null;
  }

  const handleBack = () => {
    navigate("/datasets");
  };

  const handleSelectDataset = (newDatasetId: string) => {
    navigate(`/datasets/${newDatasetId}`);
  };


  return (
    <DatasetDetailView
      datasetId={datasetId}
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
