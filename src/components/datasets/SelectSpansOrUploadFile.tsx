/**
 * SelectSpansOrUploadFile
 *
 * Displays when spans exist in the backend but no datasets in IndexedDB.
 * Allows users to select spans or upload files to create a new dataset.
 */

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Database,
  Loader2,
  Upload,
  FileJson,
  X,
} from "lucide-react";
import { ProjectsConsumer } from "@/contexts/ProjectContext";
import { DatasetsConsumer } from "@/contexts/DatasetsContext";
import type { Span } from "@/types/common-type";
import { useVirtualizer } from "@tanstack/react-virtual";
import { toast } from "sonner";
import { extractDataInfoFromSpan } from "@/utils/modelUtils";
import { SpansSelectTable } from "./SpansSelectTable";

const ROW_HEIGHT = 56;

// Type for uploaded file records
interface UploadedRecord {
  id: string;
  messages: unknown[];
  tools?: unknown[];
}

export function SelectSpansOrUploadFile() {
  const { currentProjectId } = ProjectsConsumer();
  const { createDataset, importRecords } = DatasetsConsumer();

  // Active tab
  const [activeTab, setActiveTab] = useState<"traces" | "upload">("traces");

  // Spans selection state
  const [selectedSpanIds, setSelectedSpanIds] = useState<Set<string>>(new Set());
  const [spans, setSpans] = useState<Span[]>([]);

  // Upload file state
  const [uploadedRecords, setUploadedRecords] = useState<UploadedRecord[]>([]);
  const [selectedUploadIds, setSelectedUploadIds] = useState<Set<string>>(new Set());
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Dataset info
  const [datasetName, setDatasetName] = useState("");
  const [finetuneObjective, setFinetuneObjective] = useState("");

  // Creating state
  const [isCreating, setIsCreating] = useState(false);

  // Upload selection handlers
  const toggleUploadSelection = (id: string) => {
    setSelectedUploadIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAllUploads = () => {
    if (selectedUploadIds.size === uploadedRecords.length) {
      setSelectedUploadIds(new Set());
    } else {
      setSelectedUploadIds(new Set(uploadedRecords.map((r) => r.id)));
    }
  };

  // File upload handlers
  const handleFileUpload = async (file: File) => {
    if (!file.name.endsWith(".jsonl")) {
      toast.error("Please upload a .jsonl file");
      return;
    }

    try {
      const text = await file.text();
      const lines = text.trim().split("\n");
      const records: UploadedRecord[] = [];

      for (let i = 0; i < lines.length; i++) {
        try {
          const parsed = JSON.parse(lines[i]);
          records.push({
            id: `upload-${i}`,
            messages: parsed.messages || [],
            tools: parsed.tools,
          });
        } catch {
          console.warn(`Skipping invalid JSON at line ${i + 1}`);
        }
      }

      if (records.length === 0) {
        toast.error("No valid records found in file");
        return;
      }

      setUploadedRecords(records);
      setUploadFileName(file.name);
      setSelectedUploadIds(new Set(records.map((r) => r.id)));
      toast.success(`Loaded ${records.length} records from ${file.name}`);
    } catch (err) {
      console.error("Failed to parse file:", err);
      toast.error("Failed to parse file");
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const clearUploadedFile = () => {
    setUploadedRecords([]);
    setUploadFileName(null);
    setSelectedUploadIds(new Set());
  };

  // Create dataset
  const handleCreateDataset = async () => {
    if (!datasetName.trim()) {
      toast.error("Please enter a dataset name");
      return;
    }

    const hasSpanSelection = activeTab === "traces" && selectedSpanIds.size > 0;
    const hasUploadSelection = activeTab === "upload" && selectedUploadIds.size > 0;

    if (!hasSpanSelection && !hasUploadSelection) {
      toast.error("Please select at least one record");
      return;
    }

    setIsCreating(true);
    try {
      // Create the dataset
      const dataset = await createDataset(datasetName.trim());

      let records: { data: unknown; topic?: string }[];

      if (activeTab === "traces") {
        // Convert selected spans to records using the shared utility
        const selectedSpans = spans.filter((s) => selectedSpanIds.has(s.span_id));
        records = selectedSpans.map((span) => {
          const dataInfo = extractDataInfoFromSpan(span);
          return {
            data: dataInfo,
          };
        });
      } else {
        // Convert selected uploads to records
        const selectedUploads = uploadedRecords.filter((r) => selectedUploadIds.has(r.id));
        records = selectedUploads.map((record) => ({
          data: {
            input: {
              messages: record.messages.slice(0, -1),
              tools: record.tools,
            },
            output: { messages: record.messages.slice(-1) },
            metadata: {
              finetuneObjective: finetuneObjective.trim() || undefined,
              importedAt: Date.now(),
            },
          },
        }));
      }

      await importRecords(dataset.id, records);
      toast.success(`Created dataset "${datasetName}" with ${records.length} records`);

      // Reset state
      setDatasetName("");
      setFinetuneObjective("");
      setSelectedSpanIds(new Set());
      setSelectedUploadIds(new Set());
    } catch (err) {
      console.error("Failed to create dataset:", err);
      toast.error("Failed to create dataset");
    } finally {
      setIsCreating(false);
    }
  };

  // Get selection count based on active tab
  const selectionCount = activeTab === "traces" ? selectedSpanIds.size : selectedUploadIds.size;

  return (
    <div className="flex-1 flex flex-col p-6 overflow-hidden">
      {/* Header row with title and tabs */}
      <div className="flex items-center justify-between mb-4 flex-shrink-0">
        <h1 className="text-2xl font-bold">Create New Dataset</h1>
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "traces" | "upload")}
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

      {/* Two-column layout - aligned content */}
      <div className="flex-1 flex gap-6 min-h-0 overflow-hidden">
        {/* Left: Data Section */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {activeTab === "traces" ? (
            <SpansSelectTable
              projectId={currentProjectId ?? null}
              selectedSpanIds={selectedSpanIds}
              onSelectionChange={setSelectedSpanIds}
              onSpansLoaded={setSpans}
            />
          ) : (
            /* Upload File Tab */
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              {uploadedRecords.length === 0 ? (
                // Drop zone
                <div
                  className={`flex-1 border-2 border-dashed rounded-lg flex flex-col items-center justify-center transition-colors ${
                    isDragging
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-muted-foreground/50"
                  }`}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                >
                  <FileJson className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-lg font-medium mb-2">Drop your .jsonl file here</p>
                  <p className="text-sm text-muted-foreground mb-4">
                    or click to browse
                  </p>
                  <input
                    type="file"
                    accept=".jsonl"
                    className="hidden"
                    id="file-upload"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file);
                    }}
                  />
                  <Button variant="outline" asChild>
                    <label htmlFor="file-upload" className="cursor-pointer">
                      Browse Files
                    </label>
                  </Button>
                </div>
              ) : (
                // Uploaded records table
                <div className="flex-1 flex flex-col min-h-0">
                  {/* File info header */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <FileJson className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{uploadFileName}</span>
                      <span className="text-sm text-muted-foreground">
                        ({uploadedRecords.length} records)
                      </span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={clearUploadedFile}>
                      <X className="h-4 w-4 mr-1" />
                      Clear
                    </Button>
                  </div>

                  {/* Records table */}
                  <UploadedRecordsList
                    records={uploadedRecords}
                    selectedIds={selectedUploadIds}
                    onToggleSelectAll={toggleSelectAllUploads}
                    onToggleSelection={toggleUploadSelection}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Dataset Info */}
        <div className="w-80 flex-shrink-0">
          <div className="border border-border rounded-lg p-6 bg-card">
            <h2 className="text-lg font-semibold mb-6">Dataset Info</h2>

            <div className="space-y-6">
              {/* Dataset Name */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Dataset Name
                </label>
                <Input
                  placeholder="my-training-dataset"
                  value={datasetName}
                  onChange={(e) => setDatasetName(e.target.value)}
                />
              </div>

              {/* Finetune Objective */}
              <div>
                <label className="block text-sm font-medium mb-1">
                  Training Objective
                  <span className="text-muted-foreground font-normal ml-2">(Optional)</span>
                </label>
                <Textarea
                  placeholder="Describe specific behaviors you want to reinforce or suppress..."
                  value={finetuneObjective}
                  onChange={(e) => setFinetuneObjective(e.target.value)}
                  className="min-h-[120px] resize-none"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  This helps the optimizer refine the RFT model weights during training.
                </p>
              </div>

              {/* Selection summary */}
              <div className="pt-4 border-t border-border">
                <div className="flex items-center justify-between text-sm mb-4">
                  <span className="text-muted-foreground">Selected records</span>
                  <span className="font-medium">{selectionCount}</span>
                </div>

                <Button
                  className="w-full gap-2"
                  disabled={!datasetName.trim() || selectionCount === 0 || isCreating}
                  onClick={handleCreateDataset}
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Database className="h-4 w-4" />
                      Create Dataset
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Virtualized uploaded records list component
 */
function UploadedRecordsList({
  records,
  selectedIds,
  onToggleSelectAll,
  onToggleSelection,
}: {
  records: UploadedRecord[];
  selectedIds: Set<string>;
  onToggleSelectAll: () => void;
  onToggleSelection: (id: string) => void;
}) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: records.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
  });

  return (
    <div className="flex-1 border border-border rounded-lg bg-card overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-muted/30 flex-shrink-0">
        <Checkbox
          checked={selectedIds.size === records.length && records.length > 0}
          onCheckedChange={onToggleSelectAll}
        />
        <span className="text-sm font-medium flex-1">Record</span>
        <span className="text-sm font-medium w-24 text-right">Messages</span>
        <span className="text-sm font-medium w-24 text-right">Tools</span>
      </div>

      {/* Virtualized rows */}
      <div ref={parentRef} className="flex-1 overflow-auto">
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const record = records[virtualRow.index];
            const firstMessage = record.messages[0] as { role?: string; content?: string } | undefined;
            const preview = firstMessage?.content
              ? firstMessage.content.slice(0, 60) + (firstMessage.content.length > 60 ? "..." : "")
              : "No content";

            return (
              <div
                key={record.id}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualRow.size}px`,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                className={`flex items-center gap-3 px-4 border-b border-border hover:bg-muted/20 cursor-pointer transition-colors ${
                  selectedIds.has(record.id) ? "bg-muted/40" : ""
                }`}
                onClick={() => onToggleSelection(record.id)}
              >
                <Checkbox
                  checked={selectedIds.has(record.id)}
                  onCheckedChange={() => onToggleSelection(record.id)}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{preview}</p>
                  <p className="text-xs text-muted-foreground">
                    Row {virtualRow.index + 1}
                  </p>
                </div>
                <div className="w-24 text-right text-sm text-muted-foreground">
                  {record.messages.length}
                </div>
                <div className="w-24 text-right text-sm text-muted-foreground">
                  {record.tools?.length || 0}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
