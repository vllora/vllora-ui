/**
 * useIngestData
 *
 * Custom hook that manages all state and logic for the ingest data dialog.
 * Handles two data sources (traces & file upload) and two modes (detail & list).
 */

import { useState, useEffect, useCallback } from "react";
import { extractDataInfoFromSpan } from "@/utils/modelUtils";
import type { Span } from "@/types/common-type";
import type { ParseStatus } from "../FileDropZone";
import type { DatasetEvaluation } from "@/types/dataset-types";

export interface ParsedRecord {
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
  target?: DatasetTarget;
  newDatasetName?: string;
  existingDatasetId?: string;
}

interface UseIngestDataOptions {
  /** Pre-selected dataset ID for list mode */
  preselectedDatasetId?: string;
  /** Whether this is list mode (no datasetId provided) */
  isListMode: boolean;
  /** Current record count (for detail mode) */
  currentRecordCount?: number;
}

export function useIngestData(options: UseIngestDataOptions) {
  const { preselectedDatasetId, isListMode, currentRecordCount = 0 } = options;

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

  // List mode specific state
  const [datasetTarget, setDatasetTarget] = useState<DatasetTarget>(
    preselectedDatasetId ? "existing" : "new"
  );
  const [newDatasetName, setNewDatasetName] = useState("");
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>(
    preselectedDatasetId ?? ""
  );

  // Reset all state to initial values
  const resetState = useCallback(() => {
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
    setDatasetTarget(preselectedDatasetId ? "existing" : "new");
    setNewDatasetName("");
    setSelectedDatasetId(preselectedDatasetId ?? "");
  }, [preselectedDatasetId]);

  // Sync state when preselectedDatasetId changes
  useEffect(() => {
    if (preselectedDatasetId) {
      setDatasetTarget("existing");
      setSelectedDatasetId(preselectedDatasetId);
    }
  }, [preselectedDatasetId]);

  // Extract a record from various JSON formats
  const extractRecord = useCallback((item: Record<string, unknown>): ParsedRecord => {
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
  }, []);

  // Parse a JSON file (single object or array)
  const parseJsonFile = useCallback(async (content: string): Promise<ParsedRecord[]> => {
    const parsed = JSON.parse(content);

    if (Array.isArray(parsed)) {
      return parsed.map(extractRecord);
    } else if (parsed.records && Array.isArray(parsed.records)) {
      // Exported dataset format: { name, records: [...] }
      return parsed.records.map(extractRecord);
    } else {
      // Single object - treat as one record
      return [extractRecord(parsed)];
    }
  }, [extractRecord]);

  // Parse a JSONL file (one JSON object per line)
  const parseJsonlFile = useCallback((content: string): ParsedRecord[] => {
    const lines = content.split("\n").filter(line => line.trim());
    return lines.map((line, index) => {
      try {
        const parsed = JSON.parse(line);
        return extractRecord(parsed);
      } catch {
        throw new Error(`Invalid JSON on line ${index + 1}`);
      }
    });
  }, [extractRecord]);

  // Handle file selection and parsing
  const handleFileSelect = useCallback(async (selectedFile: File) => {
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
  }, [parseJsonFile, parseJsonlFile]);

  // Spans selection handlers
  const handleAllMatchingSelectedChange = useCallback((allSelected: boolean, totalCount: number) => {
    setIsAllMatchingSelected(allSelected);
    setTotalMatchingCount(totalCount);
  }, []);

  const handleProvideFetchAllMatching = useCallback((fetchFn: () => Promise<Span[]>) => {
    setFetchAllMatchingSpans(() => fetchFn);
  }, []);

  // Handle dataset target change (list mode)
  const handleDatasetTargetChange = useCallback((value: DatasetTarget) => {
    setDatasetTarget(value);
    if (value === "new") {
      setSelectedDatasetId("");
      setImportMode("append");
    }
  }, []);

  // Computed: selection count based on active tab
  const selectionCount = activeTab === "traces"
    ? (isAllMatchingSelected ? totalMatchingCount : selectedSpanIds.size)
    : records.length;

  // Computed: whether there's a valid selection
  const hasSelection = activeTab === "traces"
    ? (selectedSpanIds.size > 0 || isAllMatchingSelected)
    : parseStatus === "success";

  // Check if import button should be enabled
  const canImport = useCallback(() => {
    if (!hasSelection) return false;
    if (isListMode) {
      if (datasetTarget === "new") return newDatasetName.trim().length > 0;
      if (datasetTarget === "existing") return !!selectedDatasetId;
    }
    return true;
  }, [hasSelection, isListMode, datasetTarget, newDatasetName, selectedDatasetId]);

  // Build the import records from current selection
  const buildImportRecords = useCallback(async (): Promise<ParsedRecord[]> => {
    if (activeTab === "traces") {
      let spansToConvert: Span[];

      if (isAllMatchingSelected && fetchAllMatchingSpans) {
        spansToConvert = await fetchAllMatchingSpans();
      } else {
        spansToConvert = spans.filter((s) => selectedSpanIds.has(s.span_id));
      }

      return spansToConvert.map((span) => {
        const dataInfo = extractDataInfoFromSpan(span);
        return { data: dataInfo };
      });
    } else {
      return records;
    }
  }, [activeTab, isAllMatchingSelected, fetchAllMatchingSpans, spans, selectedSpanIds, records]);

  // Build the full import result (for list mode)
  const buildImportResult = useCallback(async (): Promise<ImportResult> => {
    const importRecords = await buildImportRecords();
    return {
      records: importRecords,
      mode: datasetTarget === "new" ? "append" : importMode,
      defaultTopic: topic.trim() || undefined,
      target: datasetTarget,
      newDatasetName: datasetTarget === "new" ? newDatasetName.trim() : undefined,
      existingDatasetId: datasetTarget === "existing" ? selectedDatasetId : undefined,
    };
  }, [buildImportRecords, datasetTarget, importMode, topic, newDatasetName, selectedDatasetId]);

  return {
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
    spans,
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

    // For display
    currentRecordCount,
  };
}
