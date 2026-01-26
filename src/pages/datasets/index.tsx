import { Navigate } from "react-router";
import { DatasetsUIProvider, DatasetsUIConsumer } from "@/contexts/DatasetsUIContext";
import { DatasetsGrid } from "@/components/datasets/table";
import { EmptyDatasetsState } from "@/components/datasets/EmptyDatasetsState";
import { Loader2 } from "lucide-react";

// Inner component that uses the UI context
function DatasetsPageContent() {
  const {
    navigateToDataset,
    datasets,
    isLoading,
    hasBackendSpans,
    isCheckingSpans,
  } = DatasetsUIConsumer();

  // Show empty state when no datasets exist AND no spans in backend
  // Show span selection when spans exist but no datasets
  const noDatasets = datasets.length === 0;
  const showLoadingState = isLoading || isCheckingSpans;
  const showEmptyState = !showLoadingState && noDatasets && !hasBackendSpans;
  const showSpanSelection = !showLoadingState && noDatasets && hasBackendSpans;

  return (
    <section className="flex-1 flex overflow-hidden bg-background text-foreground relative">
      <div className="flex-1 flex flex-col overflow-hidden">
        {showLoadingState && noDatasets ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : showEmptyState ? (
          <EmptyDatasetsState />
        ) : showSpanSelection ? (
          <Navigate to="/datasets/new" replace />
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
