import { DatasetsUIProvider, DatasetsUIConsumer } from "@/contexts/DatasetsUIContext";
import { DatasetsGrid } from "@/components/datasets/table";
import { Loader2 } from "lucide-react";
import { EmptyDatasetsState } from "@/components/datasets/empty-dataset-state";

// Inner component that uses the UI context
function DatasetsPageContent() {
  const {
    navigateToDataset,
    datasets,
    isLoading,
  } = DatasetsUIConsumer();


  const noDatasets = datasets.length === 0;

  // Mark as visited once user has dataset
  return (
    <section className="flex-1 flex overflow-hidden bg-background text-foreground relative">
      <div className="flex-1 flex flex-col overflow-hidden">
        {isLoading && noDatasets ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : noDatasets ? (
          <EmptyDatasetsState />
        ) : (
          <DatasetsGrid onSelectDataset={navigateToDataset} />
        )}
      </div>
    </section>
  );
}

// Main component wrapped with UI provider
export function DatasetsPage() {
  return (
    <DatasetsUIProvider>
      <DatasetsPageContent />
    </DatasetsUIProvider>
  );
}
