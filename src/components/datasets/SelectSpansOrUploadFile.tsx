/**
 * SelectSpansOrUploadFile
 *
 * Displays when spans exist in the backend but no datasets in IndexedDB.
 * Allows users to select spans or upload files to create a new dataset.
 */

import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Database, Upload, ArrowLeft } from "lucide-react";
import { ProjectsConsumer } from "@/contexts/ProjectContext";
import { DatasetsConsumer } from "@/contexts/DatasetsContext";
import type { Span } from "@/types/common-type";
import { toast } from "sonner";
import { extractDataInfoFromSpan } from "@/utils/modelUtils";
import { parseJsonlChunked, type ParseProgress } from "@/utils/jsonl-parser";
import {
  saveUploadSession,
  loadUploadSession,
  clearUploadSession,
} from "@/services/upload-session-db";
import { SpansSelectTable } from "./spans-select-table";
import { FileUploadSection, type UploadedRecord } from "./upload-records-section";
import { DatasetInfoSidebar } from "./DatasetInfoSidebar";

type TabValue = "traces" | "upload";

export function SelectSpansOrUploadFile() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentProjectId } = ProjectsConsumer();
  const { createDataset, importRecords } = DatasetsConsumer();

  // Active tab - read from URL, default to "traces"
  const tabFromUrl = searchParams.get("tab");
  const activeTab: TabValue = tabFromUrl === "upload" ? "upload" : "traces";

  const handleTabChange = (value: string) => {
    const newTab = value as TabValue;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (newTab === "traces") {
        next.delete("tab"); // Default tab, no need to show in URL
      } else {
        next.set("tab", newTab);
      }
      return next;
    });
  };

  // Spans selection state
  const [selectedSpanIds, setSelectedSpanIds] = useState<Set<string>>(new Set());
  const [spans, setSpans] = useState<Span[]>([]);
  const [isAllMatchingSelected, setIsAllMatchingSelected] = useState(false);
  const [totalMatchingCount, setTotalMatchingCount] = useState(0);

  // Upload file state
  const [uploadedRecords, setUploadedRecords] = useState<UploadedRecord[]>([]);
  const [selectedUploadIds, setSelectedUploadIds] = useState<Set<string>>(new Set());
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<ParseProgress | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Dataset info
  const [datasetName, setDatasetName] = useState("");
  const [finetuneObjective, setFinetuneObjective] = useState("");

  // Creating state
  const [isCreating, setIsCreating] = useState(false);

  // Load upload session from IndexedDB on mount
  useEffect(() => {
    const loadSession = async () => {
      try {
        const session = await loadUploadSession();
        if (session) {
          setUploadedRecords(session.records);
          setUploadFileName(session.fileName);
          setSelectedUploadIds(new Set(session.selectedIds));
        }
      } catch (err) {
        console.error("Failed to load upload session:", err);
      }
    };
    loadSession();
  }, []);

  // Save upload session to IndexedDB when records or selection changes
  const saveSession = useCallback(async (
    fileName: string | null,
    records: UploadedRecord[],
    selectedIds: Set<string>
  ) => {
    if (!fileName || records.length === 0) {
      return;
    }
    try {
      await saveUploadSession(fileName, records, Array.from(selectedIds));
    } catch (err) {
      console.error("Failed to save upload session:", err);
    }
  }, []);

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

  // File upload handlers - uses chunked parsing for large files
  const handleFileUpload = async (file: File) => {
    if (!file.name.endsWith(".jsonl")) {
      toast.error("Please upload a .jsonl file");
      return;
    }

    setIsUploading(true);
    setUploadProgress(null);

    try {
      // Use chunked parsing with progress reporting
      const result = await parseJsonlChunked(file, (progress) => {
        setUploadProgress(progress);
      });

      if (result.records.length === 0) {
        toast.error("No valid records found in file");
        setIsUploading(false);
        setUploadProgress(null);
        return;
      }

      const allSelectedIds = new Set(result.records.map((r) => r.id));
      setUploadedRecords(result.records);
      setUploadFileName(file.name);
      setSelectedUploadIds(allSelectedIds);

      // Persist to IndexedDB
      await saveSession(file.name, result.records, allSelectedIds);

      // Show success with format info
      const formatInfo = result.detectedFormat === "datainfo"
        ? "(DataInfo format)"
        : result.detectedFormat === "export"
          ? "(messages/tools format)"
          : "";

      const errorInfo = result.errorLines.length > 0
        ? ` (${result.errorLines.length} invalid lines skipped)`
        : "";

      toast.success(`Loaded ${result.records.length} records from ${file.name} ${formatInfo}${errorInfo}`);
    } catch (err) {
      console.error("Failed to parse file:", err);
      toast.error("Failed to parse file");
    } finally {
      setIsUploading(false);
      setUploadProgress(null);
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

  const clearUploadedFile = async () => {
    setUploadedRecords([]);
    setUploadFileName(null);
    setSelectedUploadIds(new Set());
    // Clear from IndexedDB
    try {
      await clearUploadSession();
    } catch (err) {
      console.error("Failed to clear upload session:", err);
    }
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
        // Convert selected uploads to records - already in DataInfo format
        const selectedUploads = uploadedRecords.filter((r) => selectedUploadIds.has(r.id));
        records = selectedUploads.map((record) => ({
          // record.data is already normalized to DataInfo format by the parser
          data: record.data,
        }));
      }

      await importRecords(dataset.id, records);
      toast.success(`Created dataset "${datasetName}" with ${records.length} records`);

      // Clear upload session from IndexedDB if we used uploaded records
      if (activeTab === "upload") {
        try {
          await clearUploadSession();
        } catch (err) {
          console.error("Failed to clear upload session:", err);
        }
      }

      // Navigate to datasets list
      navigate("/datasets");
    } catch (err) {
      console.error("Failed to create dataset:", err);
      toast.error("Failed to create dataset");
    } finally {
      setIsCreating(false);
    }
  };

  // Handle "select all matching" state changes
  const handleAllMatchingSelectedChange = (allSelected: boolean, totalCount: number) => {
    setIsAllMatchingSelected(allSelected);
    setTotalMatchingCount(totalCount);
  };

  // Get selection count based on active tab
  // When "all matching" is selected, use total count instead of just loaded spans
  const selectionCount = activeTab === "traces"
    ? (isAllMatchingSelected ? totalMatchingCount : selectedSpanIds.size)
    : selectedUploadIds.size;

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
          onCreateDataset={handleCreateDataset}
        />
      </div>
    </div>
  );
}

