/**
 * SelectSpansOrUploadFile
 *
 * Displays when spans exist in the backend but no datasets in IndexedDB.
 * Allows users to select spans or upload files to create a new dataset.
 */

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Database, Upload } from "lucide-react";
import { ProjectsConsumer } from "@/contexts/ProjectContext";
import { DatasetsConsumer } from "@/contexts/DatasetsContext";
import type { Span } from "@/types/common-type";
import { toast } from "sonner";
import { extractDataInfoFromSpan } from "@/utils/modelUtils";
import { SpansSelectTable } from "./spans-select-table";
import { type UploadedRecord } from "./UploadedRecordsList";
import { FileUploadSection } from "./FileUploadSection";
import { DatasetInfoSidebar } from "./DatasetInfoSidebar";

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
    <div className="h-full w-full max-w-full flex flex-col p-6 overflow-hidden box-border">
      {/* Header row with title and tabs */}
      <div className="flex items-center justify-between mb-4 shrink-0">
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
            />
          ) : (
            <FileUploadSection
              uploadedRecords={uploadedRecords}
              uploadFileName={uploadFileName}
              selectedIds={selectedUploadIds}
              isDragging={isDragging}
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
          onCreateDataset={handleCreateDataset}
        />
      </div>
    </div>
  );
}

