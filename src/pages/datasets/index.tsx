import { useEffect, useState } from "react";
import { Navigate } from "react-router";
import { DatasetsUIProvider, DatasetsUIConsumer } from "@/contexts/DatasetsUIContext";
import { DatasetsGrid } from "@/components/datasets/table";
import { EmptyDatasetsState } from "@/components/datasets/EmptyDatasetsState";
import { Loader2 } from "lucide-react";

const DATASETS_VISITED_KEY = "vllora:datasets:hasVisited";

// Inner component that uses the UI context
function DatasetsPageContent() {
  const {
    navigateToDataset,
    datasets,
    isLoading,
    hasBackendSpans,
    isCheckingSpans,
  } = DatasetsUIConsumer();

  // Track if this is the user's first time (for auto-navigation)
  const [isFirstVisit, setIsFirstVisit] = useState(() => {
    return localStorage.getItem(DATASETS_VISITED_KEY) !== "true";
  });

  // Show empty state when no datasets exist (and not first-time user with spans)
  // Show span selection only for first-time users when spans exist but no datasets
  const noDatasets = datasets.length === 0;
  const showLoadingState = isLoading || isCheckingSpans;
  const navigateToNewDataset = (hasBackendSpans || isFirstVisit) && noDatasets;
  const showEmptyState = !showLoadingState && noDatasets && !navigateToNewDataset;
  // Mark as visited once user has datasets
  useEffect(() => {
    if (datasets.length > 0 && isFirstVisit) {
      localStorage.setItem(DATASETS_VISITED_KEY, "true");
      setIsFirstVisit(false);
    }
  }, [datasets.length, isFirstVisit]);

  // Mark as visited when auto-navigating to prevent repeat navigation
  useEffect(() => {
    if (navigateToNewDataset && isFirstVisit) {
      localStorage.setItem(DATASETS_VISITED_KEY, "true");
    }
  }, [navigateToNewDataset, isFirstVisit]);

  return (
    <section className="flex-1 flex overflow-hidden bg-background text-foreground relative">
      <div className="flex-1 flex flex-col overflow-hidden">
        {showLoadingState && noDatasets ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : showEmptyState ? (
          <EmptyDatasetsState />
        ) : navigateToNewDataset ? (
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
