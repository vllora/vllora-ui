/**
 * SelectSpansOrUploadFile
 *
 * Displays when spans exist in the backend but no datasets in IndexedDB.
 * Allows users to select spans or upload files to create a new dataset.
 */

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Database, Upload, ArrowLeft } from "lucide-react";
import { SpansSelectTable } from "./spans-select-table";
import { FileUploadSection } from "./upload-records-section";
import { DatasetInfoSidebar } from "./DatasetInfoSidebar";
import { useDatasetCreation } from "./hooks";

export function SelectSpansOrUploadFile() {
  const {
    // Navigation
    navigate,

    // Project
    currentProjectId,

    // Tab state
    activeTab,
    handleTabChange,

    // Spans selection
    selectedSpanIds,
    setSelectedSpanIds,
    setSpans,
    handleAllMatchingSelectedChange,
    handleProvideFetchAllMatching,

    // Upload state
    uploadedRecords,
    uploadFileName,
    selectedUploadIds,
    isDragging,
    isUploading,
    uploadProgress,
    toggleUploadSelection,
    toggleSelectAllUploads,
    handleFileUpload,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    clearUploadedFile,

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
      {/* Header row with title and tabs */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="flex items-center gap-3">
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
        <Tabs
          value={activeTab}
          onValueChange={handleTabChange}
        >
          <TabsList className="w-fit">
            <TabsTrigger value="traces" className="gap-2">
              <Database className="h-4 w-4" />
              Gateway Traces
            </TabsTrigger>
            <TabsTrigger value="upload" className="gap-2">
              <Upload className="h-4 w-4" />
              Upload File
              {uploadedRecords.length > 0 && (
                <span className="ml-1 text-xs bg-muted px-1.5 py-0.5 rounded">
                  {uploadedRecords.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Two-column layout - 3:1 ratio using grid */}
      <div className="flex-1 grid grid-cols-4 gap-6 min-h-0 max-w-full overflow-hidden">
        {/* Left: Data Section - 3/4 width */}
        <div className="col-span-3 flex flex-col min-w-0 overflow-hidden">
          {activeTab === "traces" ? (
            <SpansSelectTable
              projectId={currentProjectId ?? null}
              selectedSpanIds={selectedSpanIds}
              onSelectionChange={setSelectedSpanIds}
              onSpansLoaded={setSpans}
              onAllMatchingSelectedChange={handleAllMatchingSelectedChange}
              onProvideFetchAllMatching={handleProvideFetchAllMatching}
            />
          ) : (
            <FileUploadSection
              uploadedRecords={uploadedRecords}
              uploadFileName={uploadFileName}
              selectedIds={selectedUploadIds}
              isDragging={isDragging}
              isUploading={isUploading}
              uploadProgress={uploadProgress}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onFileUpload={handleFileUpload}
              onToggleSelectAll={toggleSelectAllUploads}
              onToggleSelection={toggleUploadSelection}
              onClear={clearUploadedFile}
            />
          )}
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
