import { useEffect } from "react";
import { useLocalStorageState } from "ahooks";
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
  } = DatasetsUIConsumer();

  // Track if this is the user's first time (for auto-navigation)
  const [hasVisited, setHasVisited] = useLocalStorageState<boolean>(DATASETS_VISITED_KEY, {
    defaultValue: false,
  });
  const isFirstVisit = !hasVisited;

  const noDatasets = datasets.length === 0;
  const showEmptyState = isFirstVisit && noDatasets;

  // Mark as visited once user has datasets
  useEffect(() => {
    if (datasets.length > 0 && isFirstVisit) {
      setHasVisited(true);
    }
  }, [datasets.length, isFirstVisit, setHasVisited]);

  return (
    <section className="flex-1 flex overflow-hidden bg-background text-foreground relative">
      <div className="flex-1 flex flex-col overflow-hidden">
        {isLoading && noDatasets ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : showEmptyState ? (
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
