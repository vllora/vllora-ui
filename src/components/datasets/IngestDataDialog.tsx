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

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Upload, Plus, Database } from "lucide-react";
import { FileDropZone, type ParseStatus } from "./FileDropZone";
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
import { extractDataInfoFromSpan } from "@/utils/modelUtils";
import type { Span } from "@/types/common-type";
import { Dataset, DatasetEvaluation } from "@/types/dataset-types";

interface ParsedRecord {
  data: unknown;
  topic?: string;
  evaluation?: DatasetEvaluation;
}

export type ImportMode = "append" | "replace";
export type DatasetTarget = "new" | "existing";
export type DataSourceTab = "traces" | "upload";

export interface ImportResult {
  records: ParsedRecord[];
  mode: ImportMode;
  defaultTopic?: string;
  // For list mode
  target?: DatasetTarget;
  newDatasetName?: string;
  existingDatasetId?: string;
}

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

  // Tab state
  const [activeTab, setActiveTab] = useState<DataSourceTab>("traces");

  // File upload state
  const [file, setFile] = useState<File | null>(null);
  const [records, setRecords] = useState<ParsedRecord[]>([]);
  const [parseStatus, setParseStatus] = useState<ParseStatus>("idle");
  const [parseError, setParseError] = useState<string | null>(null);

  // Spans selection state
  const [selectedSpanIds, setSelectedSpanIds] = useState<Set<string>>(new Set());
  const [spans, setSpans] = useState<Span[]>([]);
  const [isAllMatchingSelected, setIsAllMatchingSelected] = useState(false);
  const [totalMatchingCount, setTotalMatchingCount] = useState(0);
  const [fetchAllMatchingSpans, setFetchAllMatchingSpans] = useState<(() => Promise<Span[]>) | null>(null);

  // Common state
  const [topic, setTopic] = useState("");
  const [importMode, setImportMode] = useState<ImportMode>("append");
  const [isImporting, setIsImporting] = useState(false);

  // List mode specific state - use preselected dataset if provided
  const [datasetTarget, setDatasetTarget] = useState<DatasetTarget>(
    preselectedDatasetId ? "existing" : "new"
  );
  const [newDatasetName, setNewDatasetName] = useState("");
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>(
    preselectedDatasetId ?? ""
  );

  const resetState = () => {
    setActiveTab("traces");
    setFile(null);
    setRecords([]);
    setParseStatus("idle");
    setParseError(null);
    setSelectedSpanIds(new Set());
    setSpans([]);
    setIsAllMatchingSelected(false);
    setTotalMatchingCount(0);
    setTopic("");
    setImportMode("append");
    setIsImporting(false);
    // Reset to preselected dataset if provided, otherwise default to "new"
    setDatasetTarget(preselectedDatasetId ? "existing" : "new");
    setNewDatasetName("");
    setSelectedDatasetId(preselectedDatasetId ?? "");
  };

  // Sync state when preselectedDatasetId changes (e.g., opening dialog for different dataset)
  useEffect(() => {
    if (preselectedDatasetId) {
      setDatasetTarget("existing");
      setSelectedDatasetId(preselectedDatasetId);
    }
  }, [preselectedDatasetId]);

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetState();
    }
    onOpenChange(newOpen);
  };

  const extractRecord = (item: Record<string, unknown>): ParsedRecord => {
    // Check if item has a 'data' field (exported format with full record structure)
    if (item.data !== undefined) {
      return {
        data: item.data,
        topic: item.topic as string | undefined,
        evaluation: item.evaluation as ParsedRecord['evaluation'],
      };
    }

    // Check if item is in JSONL export format: { messages, tools }
    // Reconstruct back to DataInfo structure
    if (item.messages !== undefined && Array.isArray(item.messages)) {
      const messages = item.messages as Array<Record<string, unknown>>;
      const tools = (item.tools as unknown[]) || [];

      // Split messages: all except last go to input, last goes to output
      if (messages.length > 0) {
        const inputMessages = messages.slice(0, -1);
        const outputMessage = messages[messages.length - 1];

        return {
          data: {
            input: {
              messages: inputMessages,
              ...(tools.length > 0 ? { tools } : {}),
            },
            output: {
              messages: outputMessage,
            },
          },
        };
      }

      // If no messages, just store tools in input
      return {
        data: {
          input: {
            messages: [],
            ...(tools.length > 0 ? { tools } : {}),
          },
          output: {},
        },
      };
    }

    // Otherwise treat the whole item as data
    return { data: item };
  };

  const parseJsonFile = async (content: string): Promise<ParsedRecord[]> => {
    // Try parsing as a single JSON object or array
    const parsed = JSON.parse(content);

    if (Array.isArray(parsed)) {
      // Array of records
      return parsed.map(extractRecord);
    } else if (parsed.records && Array.isArray(parsed.records)) {
      // Exported dataset format: { name, records: [...] }
      return parsed.records.map(extractRecord);
    } else {
      // Single object - treat as one record
      return [extractRecord(parsed)];
    }
  };

  const parseJsonlFile = (content: string): ParsedRecord[] => {
    const lines = content.split("\n").filter(line => line.trim());
    return lines.map((line, index) => {
      try {
        const parsed = JSON.parse(line);
        return extractRecord(parsed);
      } catch {
        throw new Error(`Invalid JSON on line ${index + 1}`);
      }
    });
  };

  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile);
    setParseStatus("parsing");
    setParseError(null);
    setRecords([]);

    try {
      const content = await selectedFile.text();
      let parsedRecords: ParsedRecord[];

      if (selectedFile.name.endsWith(".jsonl")) {
        parsedRecords = parseJsonlFile(content);
      } else {
        parsedRecords = await parseJsonFile(content);
      }

      if (parsedRecords.length === 0) {
        throw new Error("No records found in file");
      }

      setRecords(parsedRecords);
      setParseStatus("success");
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Failed to parse file");
      setParseStatus("error");
    }
  };

  // Get selection count based on active tab
  const selectionCount = activeTab === "traces"
    ? (isAllMatchingSelected ? totalMatchingCount : selectedSpanIds.size)
    : records.length;

  // Check if import is ready
  const hasSelection = activeTab === "traces"
    ? (selectedSpanIds.size > 0 || isAllMatchingSelected)
    : parseStatus === "success";

  const handleImport = async () => {
    if (!hasSelection) return;

    // Validation for list mode
    if (isListMode) {
      if (datasetTarget === "new" && !newDatasetName.trim()) {
        return;
      }
      if (datasetTarget === "existing" && !selectedDatasetId) {
        return;
      }
    }

    setIsImporting(true);
    try {
      let importRecords: ParsedRecord[];

      if (activeTab === "traces") {
        let spansToConvert: Span[];

        if (isAllMatchingSelected && fetchAllMatchingSpans) {
          // Fetch ALL matching spans from the server
          spansToConvert = await fetchAllMatchingSpans();
        } else {
          // Use only selected spans from the current page
          spansToConvert = spans.filter((s) => selectedSpanIds.has(s.span_id));
        }

        // Convert spans to records using the shared utility
        importRecords = spansToConvert.map((span) => {
          const dataInfo = extractDataInfoFromSpan(span);
          return { data: dataInfo };
        });
      } else {
        // Use parsed file records
        importRecords = records;
      }

      if (isListMode && onImportToDataset) {
        // List mode: pass full import result
        await onImportToDataset({
          records: importRecords,
          mode: datasetTarget === "new" ? "append" : importMode,
          defaultTopic: topic.trim() || undefined,
          target: datasetTarget,
          newDatasetName: datasetTarget === "new" ? newDatasetName.trim() : undefined,
          existingDatasetId: datasetTarget === "existing" ? selectedDatasetId : undefined,
        });
      } else if (onImport) {
        // Detail mode: use original callback
        await onImport(importRecords, importMode, topic.trim() || undefined);
      }
      handleOpenChange(false);
    } catch {
      // Error handled by parent
    } finally {
      setIsImporting(false);
    }
  };

  // Check if import button should be enabled
  const canImport = () => {
    if (!hasSelection) return false;
    if (isListMode) {
      if (datasetTarget === "new") return newDatasetName.trim().length > 0;
      if (datasetTarget === "existing") return !!selectedDatasetId;
    }
    return true;
  };

  // Spans selection handlers
  const handleAllMatchingSelectedChange = useCallback((allSelected: boolean, totalCount: number) => {
    setIsAllMatchingSelected(allSelected);
    setTotalMatchingCount(totalCount);
  }, []);

  const handleProvideFetchAllMatching = useCallback((fetchFn: () => Promise<Span[]>) => {
    setFetchAllMatchingSpans(() => fetchFn);
  }, []);

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
                  onValueChange={(value) => {
                    setDatasetTarget(value as DatasetTarget);
                    if (value === "new") {
                      setSelectedDatasetId("");
                      setImportMode("append");
                    }
                  }}
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
