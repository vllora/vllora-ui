import { DatasetsUIProvider, DatasetsUIConsumer } from "@/contexts/DatasetsUIContext";
import { DatasetsTable } from "@/components/datasets/table";
import { DatasetDetailView } from "@/components/datasets/DatasetDetailView";
import { LucyDatasetAssistant } from "@/components/datasets/LucyDatasetAssistant";

// Inner component that uses the UI context
function DatasetsPageContent() {
  const {
    selectedDatasetId,
    navigateToDataset,
    navigateToList,
  } = DatasetsUIConsumer();

  return (
    <section className="flex-1 flex overflow-hidden bg-background text-foreground">
      {/* Left Panel - Lucy Chat */}
      <LucyDatasetAssistant />

      {/* Right Panel - Datasets List or Detail View */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedDatasetId ? (
          <DatasetDetailView
            datasetId={selectedDatasetId}
            onBack={navigateToList}
            onSelectDataset={navigateToDataset}
          />
        ) : (
          <DatasetsTable onSelectDataset={navigateToDataset} />
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
