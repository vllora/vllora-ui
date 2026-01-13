/**
 * IngestDataDialog
 *
 * Dialog for importing records from JSON/JSONL files into a dataset.
 * Supports two modes:
 * - Detail mode: Import into a specific dataset (datasetId provided)
 * - List mode: Create new dataset or select existing (no datasetId)
 */

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, Upload, FileJson, AlertCircle, CheckCircle2, Plus, Database } from "lucide-react";
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
import { Dataset, DatasetEvaluation } from "@/types/dataset-types";

interface ParsedRecord {
  data: unknown;
  topic?: string;
  evaluation?: DatasetEvaluation;
}

export type ImportMode = "append" | "replace";
export type DatasetTarget = "new" | "existing";

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
}

type IngestDataDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
} & (DetailModeProps | ListModeProps);

type ParseStatus = "idle" | "parsing" | "success" | "error";

export function IngestDataDialog(props: IngestDataDialogProps) {
  const { open, onOpenChange } = props;

  // Determine mode based on props
  const isListMode = !('datasetId' in props) || !props.datasetId;
  const datasets = isListMode ? (props as ListModeProps).datasets : [];
  const onImportToDataset = isListMode ? (props as ListModeProps).onImportToDataset : undefined;
  const onImport = !isListMode ? (props as DetailModeProps).onImport : undefined;
  const currentRecordCount = !isListMode ? (props as DetailModeProps).currentRecordCount ?? 0 : 0;

  const [file, setFile] = useState<File | null>(null);
  const [records, setRecords] = useState<ParsedRecord[]>([]);
  const [parseStatus, setParseStatus] = useState<ParseStatus>("idle");
  const [parseError, setParseError] = useState<string | null>(null);
  const [topic, setTopic] = useState("");
  const [importMode, setImportMode] = useState<ImportMode>("append");
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // List mode specific state
  const [datasetTarget, setDatasetTarget] = useState<DatasetTarget>("new");
  const [newDatasetName, setNewDatasetName] = useState("");
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>("");

  const resetState = () => {
    setFile(null);
    setRecords([]);
    setParseStatus("idle");
    setParseError(null);
    setTopic("");
    setImportMode("append");
    setIsImporting(false);
    setDatasetTarget("new");
    setNewDatasetName("");
    setSelectedDatasetId("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      resetState();
    }
    onOpenChange(newOpen);
  };

  const extractRecord = (item: Record<string, unknown>): ParsedRecord => {
    // Check if item has a 'data' field (exported format)
    if (item.data !== undefined) {
      return {
        data: item.data,
        topic: item.topic as string | undefined,
        evaluation: item.evaluation as ParsedRecord['evaluation'],
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

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

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

  const handleImport = async () => {
    if (records.length === 0) return;

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
      if (isListMode && onImportToDataset) {
        // List mode: pass full import result
        await onImportToDataset({
          records,
          mode: datasetTarget === "new" ? "append" : importMode,
          defaultTopic: topic.trim() || undefined,
          target: datasetTarget,
          newDatasetName: datasetTarget === "new" ? newDatasetName.trim() : undefined,
          existingDatasetId: datasetTarget === "existing" ? selectedDatasetId : undefined,
        });
      } else if (onImport) {
        // Detail mode: use original callback
        await onImport(records, importMode, topic.trim() || undefined);
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
    if (parseStatus !== "success") return false;
    if (isListMode) {
      if (datasetTarget === "new") return newDatasetName.trim().length > 0;
      if (datasetTarget === "existing") return !!selectedDatasetId;
    }
    return true;
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && (droppedFile.name.endsWith(".json") || droppedFile.name.endsWith(".jsonl"))) {
      // Trigger the file input change handler
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(droppedFile);
      if (fileInputRef.current) {
        fileInputRef.current.files = dataTransfer.files;
        handleFileChange({ target: fileInputRef.current } as React.ChangeEvent<HTMLInputElement>);
      }
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Data</DialogTitle>
          <DialogDescription>
            {isListMode
              ? "Import records from a JSON or JSONL file into a new or existing dataset."
              : "Import records from a JSON or JSONL file into this dataset."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* File drop zone */}
          <div
            className={`
              border-2 border-dashed rounded-lg p-6 text-center cursor-pointer
              transition-colors
              ${parseStatus === "success" ? "border-green-500/50 bg-green-500/5" : ""}
              ${parseStatus === "error" ? "border-red-500/50 bg-red-500/5" : ""}
              ${parseStatus === "idle" || parseStatus === "parsing" ? "border-border hover:border-[rgb(var(--theme-500))] hover:bg-muted/50" : ""}
            `}
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.jsonl"
              className="hidden"
              onChange={handleFileChange}
            />

            {parseStatus === "idle" && (
              <>
                <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Drop a file here or click to browse
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Supports .json and .jsonl files
                </p>
              </>
            )}

            {parseStatus === "parsing" && (
              <>
                <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Parsing file...</p>
              </>
            )}

            {parseStatus === "success" && file && (
              <>
                <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-500" />
                <div className="flex items-center justify-center gap-2 mb-1">
                  <FileJson className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">{file.name}</span>
                </div>
                <p className="text-sm text-green-600">
                  {records.length} record{records.length !== 1 ? "s" : ""} ready to import
                </p>
              </>
            )}

            {parseStatus === "error" && (
              <>
                <AlertCircle className="w-8 h-8 mx-auto mb-2 text-red-500" />
                <p className="text-sm text-red-500">{parseError}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Click to try another file
                </p>
              </>
            )}
          </div>

          {/* Import options (only show when file is parsed) */}
          {parseStatus === "success" && (
            <>
              {/* Dataset target selection (list mode only) */}
              {isListMode && (
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

              {/* Import mode - show for detail mode OR for existing dataset in list mode */}
              {(!isListMode || (isListMode && datasetTarget === "existing" && selectedDatasetId)) && (
                <div className="space-y-3">
                  <Label>Import Mode</Label>
                  <RadioGroup
                    value={importMode}
                    onValueChange={(value) => setImportMode(value as ImportMode)}
                    className="flex flex-col gap-2"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="append" id="append" />
                      <Label htmlFor="append" className="font-normal cursor-pointer">
                        Append to existing records
                        {!isListMode && currentRecordCount > 0 && (
                          <span className="text-muted-foreground ml-1">
                            ({currentRecordCount} existing + {records.length} new = {currentRecordCount + records.length} total)
                          </span>
                        )}
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="replace" id="replace" />
                      <Label htmlFor="replace" className="font-normal cursor-pointer">
                        Replace all existing records
                        {!isListMode && currentRecordCount > 0 && (
                          <span className="text-muted-foreground ml-1">
                            (delete {currentRecordCount} existing, import {records.length} new)
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
            </>
          )}
        </div>

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
              <>Import {records.length > 0 ? `${records.length} Record${records.length !== 1 ? "s" : ""}` : ""}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
