/**
 * IngestDataDialog
 *
 * Dialog for importing records into a dataset.
 * Supports two data sources:
 * - Gateway Traces: Select spans from the gateway
 * - Upload File: Import from JSON/JSONL files
 *
 * Supports two modes:
 * - Detail mode: Import into a specific dataset (datasetId provided)
 * - List mode: Create new dataset or select existing (no datasetId)
 */

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Upload, Plus, Database } from "lucide-react";
import { FileDropZone } from "./FileDropZone";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SpansSelectTable } from "./spans-select-table";
import { ProjectsConsumer } from "@/contexts/ProjectContext";
import { Dataset } from "@/types/dataset-types";
import {
  useIngestData,
  type ParsedRecord,
  type ImportMode,
  type ImportResult,
  type DataSourceTab,
  type DatasetTarget,
} from "./hooks/useIngestData";

// Re-export types for consumers
export type { ParsedRecord, ImportMode, ImportResult, DataSourceTab, DatasetTarget };

// Props for detail mode (importing into a specific dataset)
interface DetailModeProps {
  datasetId: string;
  onImport: (records: ParsedRecord[], mode: ImportMode, defaultTopic?: string) => Promise<void>;
  currentRecordCount?: number;
  datasets?: never;
  onImportToDataset?: never;
}

// Props for list mode (create new or select existing dataset)
interface ListModeProps {
  datasetId?: never;
  onImport?: never;
  currentRecordCount?: never;
  datasets: Dataset[];
  onImportToDataset: (result: ImportResult) => Promise<void>;
  /** Pre-select an existing dataset (for per-dataset import from list view) */
  preselectedDatasetId?: string;
}

type IngestDataDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
} & (DetailModeProps | ListModeProps);

export function IngestDataDialog(props: IngestDataDialogProps) {
  const { open, onOpenChange } = props;
  const { currentProjectId } = ProjectsConsumer();

  // Determine mode based on props
  const isListMode = !('datasetId' in props) || !props.datasetId;
  const datasets = isListMode ? (props as ListModeProps).datasets : [];
  const onImportToDataset = isListMode ? (props as ListModeProps).onImportToDataset : undefined;
  const onImport = !isListMode ? (props as DetailModeProps).onImport : undefined;
  const currentRecordCount = !isListMode ? (props as DetailModeProps).currentRecordCount ?? 0 : 0;
  const preselectedDatasetId = isListMode ? (props as ListModeProps).preselectedDatasetId : undefined;

  // Use the ingest data hook for all state and logic
  const {
    // Tab state
    activeTab,
    setActiveTab,

    // File upload state
    file,
    records,
    parseStatus,
    parseError,
    handleFileSelect,

    // Spans selection state
    selectedSpanIds,
    setSelectedSpanIds,
    setSpans,
    handleAllMatchingSelectedChange,
    handleProvideFetchAllMatching,

    // Common state
    topic,
    setTopic,
    importMode,
    setImportMode,
    isImporting,
    setIsImporting,

    // List mode state
    datasetTarget,
    handleDatasetTargetChange,
    newDatasetName,
    setNewDatasetName,
    selectedDatasetId,
    setSelectedDatasetId,

    // Computed values
    selectionCount,
    hasSelection,
    canImport,

    // Actions
    resetState,
    buildImportRecords,
    buildImportResult,
  } = useIngestData({
    preselectedDatasetId,
    isListMode,
    currentRecordCount,
  });

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetState();
    }
    onOpenChange(newOpen);
  };

  const handleImport = async () => {
    if (!canImport()) return;

    setIsImporting(true);
    try {
      if (isListMode && onImportToDataset) {
        const result = await buildImportResult();
        await onImportToDataset(result);
      } else if (onImport) {
        const importRecords = await buildImportRecords();
        await onImport(importRecords, importMode, topic.trim() || undefined);
      }
      handleOpenChange(false);
    } catch {
      // Error handled by parent
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Import Data</DialogTitle>
          <DialogDescription>
            {isListMode
              ? "Import records from gateway traces or a file into a new or existing dataset."
              : "Import records from gateway traces or a file into this dataset."}
          </DialogDescription>
        </DialogHeader>

        {/* Tabs for data source */}
        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as DataSourceTab)}
          className="w-full"
        >
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="traces" className="gap-2">
              <Database className="h-4 w-4" />
              Gateway Traces
              {activeTab === "traces" && selectionCount > 0 && (
                <span className="ml-1 text-xs bg-primary/20 px-1.5 py-0.5 rounded">
                  {selectionCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="upload" className="gap-2">
              <Upload className="h-4 w-4" />
              Upload File
              {activeTab === "upload" && records.length > 0 && (
                <span className="ml-1 text-xs bg-primary/20 px-1.5 py-0.5 rounded">
                  {records.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Content area */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {activeTab === "traces" ? (
            /* Spans selection */
            <div className="h-[400px] overflow-hidden">
              <SpansSelectTable
                projectId={currentProjectId ?? null}
                selectedSpanIds={selectedSpanIds}
                onSelectionChange={setSelectedSpanIds}
                onSpansLoaded={setSpans}
                onAllMatchingSelectedChange={handleAllMatchingSelectedChange}
                onProvideFetchAllMatching={handleProvideFetchAllMatching}
              />
            </div>
          ) : (
            /* File upload */
            <div className="space-y-4 py-4">
              <FileDropZone
                parseStatus={parseStatus}
                parseError={parseError}
                file={file}
                recordCount={records.length}
                onFileSelect={handleFileSelect}
              />
            </div>
          )}
        </div>

        {/* Import options (show when we have data selected) */}
        {hasSelection && (
          <div className="space-y-4 border-t pt-4">
            {/* Dataset target selection (list mode only) */}
            {isListMode && !preselectedDatasetId && (
              <div className="space-y-3">
                <Label>Destination</Label>
                <RadioGroup
                  value={datasetTarget}
                  onValueChange={(value) => handleDatasetTargetChange(value as DatasetTarget)}
                  className="flex flex-col gap-3"
                >
                  {/* Create new dataset option */}
                  <div className="flex items-start space-x-2">
                    <RadioGroupItem value="new" id="new-dataset" className="mt-1" />
                    <div className="flex-1 space-y-2">
                      <Label htmlFor="new-dataset" className="font-normal cursor-pointer flex items-center gap-2">
                        <Plus className="w-4 h-4" />
                        Create new dataset
                      </Label>
                      {datasetTarget === "new" && (
                        <Input
                          value={newDatasetName}
                          onChange={(e) => setNewDatasetName(e.target.value)}
                          placeholder="Enter dataset name"
                          className="h-8"
                        />
                      )}
                    </div>
                  </div>

                  {/* Select existing dataset option */}
                  <div className="flex items-start space-x-2">
                    <RadioGroupItem value="existing" id="existing-dataset" className="mt-1" />
                    <div className="flex-1 space-y-2">
                      <Label htmlFor="existing-dataset" className="font-normal cursor-pointer flex items-center gap-2">
                        <Database className="w-4 h-4" />
                        Add to existing dataset
                      </Label>
                      {datasetTarget === "existing" && (
                        <Select value={selectedDatasetId} onValueChange={setSelectedDatasetId}>
                          <SelectTrigger className="h-8">
                            <SelectValue placeholder="Select a dataset" />
                          </SelectTrigger>
                          <SelectContent>
                            {datasets.map((ds) => (
                              <SelectItem key={ds.id} value={ds.id}>
                                {ds.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                  </div>
                </RadioGroup>
              </div>
            )}

            {/* Preselected dataset display (when importing to specific dataset) */}
            {isListMode && preselectedDatasetId && (
              <div className="space-y-2">
                <Label>Destination</Label>
                <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 px-3 py-2 rounded-md">
                  <Database className="w-4 h-4" />
                  <span>
                    {datasets.find(d => d.id === preselectedDatasetId)?.name ?? "Selected dataset"}
                  </span>
                </div>
              </div>
            )}

            {/* Import mode - show for detail mode OR for existing dataset in list mode (including preselected) */}
            {(!isListMode || (isListMode && datasetTarget === "existing" && (selectedDatasetId || preselectedDatasetId))) && (
              <div className="space-y-3">
                <Label>Import Mode</Label>
                <RadioGroup
                  value={importMode}
                  onValueChange={(value) => setImportMode(value as ImportMode)}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="append" id="append" />
                    <Label htmlFor="append" className="font-normal cursor-pointer">
                      Append to existing
                      {!isListMode && currentRecordCount > 0 && (
                        <span className="text-muted-foreground ml-1 text-xs">
                          ({currentRecordCount} + {selectionCount})
                        </span>
                      )}
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="replace" id="replace" />
                    <Label htmlFor="replace" className="font-normal cursor-pointer">
                      Replace all
                      {!isListMode && currentRecordCount > 0 && (
                        <span className="text-muted-foreground ml-1 text-xs">
                          (delete {currentRecordCount})
                        </span>
                      )}
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            )}

            {/* Topic input */}
            <div className="space-y-2">
              <Label htmlFor="topic">Default Topic (optional)</Label>
              <Input
                id="topic"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g., safety, jailbreak, general"
              />
              <p className="text-xs text-muted-foreground">
                Applied to records that don't have a topic defined
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={!canImport() || isImporting}
            className="bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white"
          >
            {isImporting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Importing...
              </>
            ) : (
              <>Import {selectionCount > 0 ? `${selectionCount} Record${selectionCount !== 1 ? "s" : ""}` : ""}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
