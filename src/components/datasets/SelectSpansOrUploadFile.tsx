/**
 * SelectSpansOrUploadFile
 *
 * Displays when spans exist in the backend but no datasets in IndexedDB.
 * Allows users to select spans to create a new dataset.
 */

import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { SpansSelectTable } from "./spans-select-table";
import { DatasetInfoSidebar } from "./DatasetInfoSidebar";
import { useDatasetCreation } from "./hooks";

export function SelectSpansOrUploadFile() {
  const {
    // Navigation
    navigate,

    // Project
    currentProjectId,

    // Spans selection
    selectedSpanIds,
    setSelectedSpanIds,
    setSpans,
    handleAllMatchingSelectedChange,
    handleProvideFetchAllMatching,

    // Dataset info
    datasetName,
    setDatasetName,
    finetuneObjective,
    setFinetuneObjective,

    // Creating state
    isCreating,
    creatingStatus,
    selectionCount,
    handleCreateDataset,
  } = useDatasetCreation();

  return (
    <div className="h-full w-full max-w-full flex flex-col p-6 overflow-hidden box-border">
      {/* Header row with title */}
      <div className="flex items-center gap-3 mb-4 shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/datasets")}
          className="gap-1"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <h1 className="text-2xl font-bold">Create New Dataset</h1>
      </div>

      {/* Two-column layout - 3:1 ratio using grid */}
      <div className="flex-1 grid grid-cols-4 gap-6 min-h-0 max-w-full overflow-hidden">
        {/* Left: Data Section - 3/4 width */}
        <div className="col-span-3 flex flex-col min-w-0 overflow-hidden">
          <SpansSelectTable
            projectId={currentProjectId ?? null}
            selectedSpanIds={selectedSpanIds}
            onSelectionChange={setSelectedSpanIds}
            onSpansLoaded={setSpans}
            onAllMatchingSelectedChange={handleAllMatchingSelectedChange}
            onProvideFetchAllMatching={handleProvideFetchAllMatching}
          />
        </div>

        {/* Right: Dataset Info - 1/4 width */}
        <DatasetInfoSidebar
          datasetName={datasetName}
          onDatasetNameChange={setDatasetName}
          finetuneObjective={finetuneObjective}
          onFinetuneObjectiveChange={setFinetuneObjective}
          selectionCount={selectionCount}
          isCreating={isCreating}
          creatingStatus={creatingStatus}
          onCreateDataset={handleCreateDataset}
        />
      </div>
    </div>
  );
}
