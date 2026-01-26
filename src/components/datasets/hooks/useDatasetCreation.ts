/**
 * useDatasetCreation
 *
 * Custom hook that manages all state and logic for the dataset creation flow.
 * Handles spans selection, file upload, and dataset creation.
 */

import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { ProjectsConsumer } from "@/contexts/ProjectContext";
import { DatasetsConsumer } from "@/contexts/DatasetsContext";
import type { Span } from "@/types/common-type";
import { extractDataInfoFromSpan } from "@/utils/modelUtils";
import { parseJsonlChunked, type ParseProgress } from "@/utils/jsonl-parser";
import {
  saveUploadSession,
  loadUploadSession,
  clearUploadSession,
} from "@/services/upload-session-db";
import type { UploadedRecord } from "../upload-records-section";

export type TabValue = "traces" | "upload";

export function useDatasetCreation() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentProjectId } = ProjectsConsumer();
  const { createDataset, importRecords } = DatasetsConsumer();

  // Active tab - read from URL, default to "traces"
  const tabFromUrl = searchParams.get("tab");
  const activeTab: TabValue = tabFromUrl === "upload" ? "upload" : "traces";

  const handleTabChange = useCallback((value: string) => {
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
  }, [setSearchParams]);

  // Spans selection state
  const [selectedSpanIds, setSelectedSpanIds] = useState<Set<string>>(new Set());
  const [spans, setSpans] = useState<Span[]>([]);
  const [isAllMatchingSelected, setIsAllMatchingSelected] = useState(false);
  const [totalMatchingCount, setTotalMatchingCount] = useState(0);
  const [fetchAllMatchingSpans, setFetchAllMatchingSpans] = useState<(() => Promise<Span[]>) | null>(null);

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
  const [creatingStatus, setCreatingStatus] = useState<string | undefined>(undefined);

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

  // Save upload session to IndexedDB
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
  const toggleUploadSelection = useCallback((id: string) => {
    setSelectedUploadIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const toggleSelectAllUploads = useCallback(() => {
    if (selectedUploadIds.size === uploadedRecords.length) {
      setSelectedUploadIds(new Set());
    } else {
      setSelectedUploadIds(new Set(uploadedRecords.map((r) => r.id)));
    }
  }, [selectedUploadIds.size, uploadedRecords]);

  // File upload handlers - uses chunked parsing for large files
  const handleFileUpload = useCallback(async (file: File) => {
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
  }, [saveSession]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileUpload(file);
    }
  }, [handleFileUpload]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const clearUploadedFile = useCallback(async () => {
    setUploadedRecords([]);
    setUploadFileName(null);
    setSelectedUploadIds(new Set());
    // Clear from IndexedDB
    try {
      await clearUploadSession();
    } catch (err) {
      console.error("Failed to clear upload session:", err);
    }
  }, []);

  // Create dataset
  const handleCreateDataset = useCallback(async () => {
    if (!datasetName.trim()) {
      toast.error("Please enter a dataset name");
      return;
    }

    const hasSpanSelection = activeTab === "traces" && (selectedSpanIds.size > 0 || isAllMatchingSelected);
    const hasUploadSelection = activeTab === "upload" && selectedUploadIds.size > 0;

    if (!hasSpanSelection && !hasUploadSelection) {
      toast.error("Please select at least one record");
      return;
    }

    setIsCreating(true);
    setCreatingStatus("Creating dataset...");
    try {
      // Create the dataset
      const dataset = await createDataset(datasetName.trim(), finetuneObjective);

      let records: { data: unknown; topic?: string }[];

      if (activeTab === "traces") {
        let spansToConvert: Span[];

        if (isAllMatchingSelected && fetchAllMatchingSpans) {
          // Fetch ALL matching spans from the server
          setCreatingStatus("Fetching all spans...");
          spansToConvert = await fetchAllMatchingSpans();
        } else {
          // Use only selected spans from the current page
          spansToConvert = spans.filter((s) => selectedSpanIds.has(s.span_id));
        }

        // Convert spans to records using the shared utility
        setCreatingStatus("Converting spans...");
        records = spansToConvert.map((span) => {
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

      setCreatingStatus("Importing records...");
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
      setCreatingStatus(undefined);
    }
  }, [activeTab, datasetName, finetuneObjective, selectedSpanIds, selectedUploadIds, spans, uploadedRecords, createDataset, importRecords, navigate, isAllMatchingSelected, fetchAllMatchingSpans]);

  // Handle "select all matching" state changes
  const handleAllMatchingSelectedChange = useCallback((allSelected: boolean, totalCount: number) => {
    setIsAllMatchingSelected(allSelected);
    setTotalMatchingCount(totalCount);
  }, []);

  // Store the fetch function from SpansSelectTable
  const handleProvideFetchAllMatching = useCallback((fetchFn: () => Promise<Span[]>) => {
    setFetchAllMatchingSpans(() => fetchFn);
  }, []);

  // Get selection count based on active tab
  // When "all matching" is selected, use total count instead of just loaded spans
  const selectionCount = activeTab === "traces"
    ? (isAllMatchingSelected ? totalMatchingCount : selectedSpanIds.size)
    : selectedUploadIds.size;

  return {
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
    spans,
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
  };
}
