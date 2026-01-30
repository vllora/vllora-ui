/**
 * ImportFileCard
 *
 * Card component for importing datasets via file upload.
 * Supports drag & drop and click-to-upload with inline dataset creation.
 */

import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  FileJson,
  Upload,
  Loader2,
  CheckCircle2,
  X,
  Download,
  ArrowRight,
} from "lucide-react";
import { DatasetsConsumer } from "@/contexts/DatasetsContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Sample JSONL content for download
const SAMPLE_JSONL = `{"messages":[{"role":"system","content":"You are a helpful assistant."},{"role":"user","content":"What is the capital of France?"},{"role":"assistant","content":"The capital of France is Paris."}]}
{"messages":[{"role":"user","content":"Explain quantum computing in simple terms."},{"role":"assistant","content":"Quantum computing uses quantum bits (qubits) that can exist in multiple states simultaneously, unlike classical bits that are either 0 or 1. This allows quantum computers to process many possibilities at once, making them powerful for specific problems like cryptography and optimization."}]}
{"messages":[{"role":"system","content":"You are a coding assistant."},{"role":"user","content":"Write a hello world in Python"},{"role":"assistant","content":"print(\\"Hello, World!\\")"}]}`;

interface ParsedRecord {
  data: unknown;
  topic?: string;
}

export function ImportFileCard() {
  const navigate = useNavigate();
  const { importRecords, createDataset } = DatasetsConsumer();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // File upload state
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedRecords, setParsedRecords] = useState<ParsedRecord[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);

  // Dataset creation state
  const [datasetName, setDatasetName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  // Extract a record from various JSON formats
  const extractRecord = useCallback((item: Record<string, unknown>): ParsedRecord => {
    // Check if item has a 'data' field (exported format with full record structure)
    if (item.data !== undefined) {
      return {
        data: item.data,
        topic: item.topic as string | undefined,
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

  // Parse file content
  const parseFile = useCallback(async (file: File) => {
    setIsParsing(true);
    setParseError(null);
    setParsedRecords([]);

    try {
      const content = await file.text();
      const records: ParsedRecord[] = [];

      if (file.name.endsWith(".jsonl")) {
        // Parse JSONL (one JSON object per line)
        const lines = content.split("\n").filter((line) => line.trim());
        for (let i = 0; i < lines.length; i++) {
          try {
            const parsed = JSON.parse(lines[i]);
            records.push(extractRecord(parsed));
          } catch {
            throw new Error(`Invalid JSON on line ${i + 1}`);
          }
        }
      } else {
        // Parse JSON (single object or array)
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
          records.push(...parsed.map(extractRecord));
        } else if (parsed.records && Array.isArray(parsed.records)) {
          records.push(...parsed.records.map(extractRecord));
        } else {
          records.push(extractRecord(parsed));
        }
      }

      if (records.length === 0) {
        throw new Error("No records found in file");
      }

      setParsedRecords(records);
      // Auto-suggest dataset name from filename
      const suggestedName = file.name.replace(/\.(json|jsonl)$/i, "");
      setDatasetName(suggestedName);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Failed to parse file");
    } finally {
      setIsParsing(false);
    }
  }, [extractRecord]);

  // Handle file selection
  const handleFileSelect = useCallback((file: File) => {
    if (!file.name.endsWith(".json") && !file.name.endsWith(".jsonl")) {
      toast.error("Please select a .json or .jsonl file");
      return;
    }
    setSelectedFile(file);
    parseFile(file);
  }, [parseFile]);

  // Handle drag events
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  // Handle file input change
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  // Clear selected file
  const handleClearFile = useCallback(() => {
    setSelectedFile(null);
    setParsedRecords([]);
    setParseError(null);
    setDatasetName("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  // Create dataset
  const handleCreateDataset = useCallback(async () => {
    if (!datasetName.trim() || parsedRecords.length === 0) return;

    setIsCreating(true);
    try {
      const dataset = await createDataset(datasetName.trim());
      await importRecords(dataset.id, parsedRecords);
      toast.success(`Created "${datasetName}" with ${parsedRecords.length} records`);
      // Navigate to the new dataset's detail page
      navigate(`/datasets/${dataset.id}`);
    } catch (err) {
      console.error("Failed to create dataset:", err);
      toast.error("Failed to create dataset");
    } finally {
      setIsCreating(false);
    }
  }, [datasetName, parsedRecords, createDataset, importRecords, navigate]);

  // Download sample JSONL
  const handleDownloadSample = useCallback(() => {
    const blob = new Blob([SAMPLE_JSONL], { type: "application/jsonl" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sample-dataset.jsonl";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  // Check if file is selected and parsed successfully
  const hasValidFile = selectedFile && parsedRecords.length > 0 && !parseError;

  return (
    <div
      className={cn(
        "group p-6 rounded-xl border transition-all duration-300 flex flex-col",
        isDragging
          ? "border-[rgb(var(--theme-500))] bg-[rgba(var(--theme-500),0.08)] border-dashed"
          : hasValidFile
            ? "border-[rgba(var(--theme-500),0.3)] bg-[rgba(var(--theme-500),0.04)]"
            : "border-border hover:border-border/80 hover:bg-muted/30"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,.jsonl"
        onChange={handleInputChange}
        className="hidden"
      />

      {!selectedFile ? (
        /* Initial state - no file selected */
        <>
          <div className="h-12 w-12 rounded-xl bg-muted border border-border flex items-center justify-center mb-4 group-hover:bg-muted/80 group-hover:scale-105 transition-all">
            <Upload className="h-6 w-6 text-muted-foreground group-hover:text-foreground transition-colors" />
          </div>
          <h3 className="font-semibold mb-2 text-left text-foreground/80 group-hover:text-foreground transition-colors">
            Import Dataset
          </h3>
          <p className="text-sm text-muted-foreground text-left mb-3">
            Drag & drop or click to upload your training data
          </p>

          {/* Format hints */}
          <div className="text-left mb-4 space-y-1.5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground/70">
              <FileJson className="h-3.5 w-3.5 flex-shrink-0" />
              <span>.jsonl with <code className="bg-muted px-1 rounded">messages</code> array</span>
            </div>
            <button
              onClick={handleDownloadSample}
              className="flex items-center gap-2 text-xs text-muted-foreground/70 hover:text-foreground transition-colors"
            >
              <Download className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="underline">Download sample file</span>
            </button>
          </div>

          <div className="flex-1" />
          <Button
            size="sm"
            variant="outline"
            className="w-full gap-2"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-4 w-4" />
            Choose File
          </Button>
        </>
      ) : isParsing ? (
        /* Parsing state */
        <div className="flex-1 flex flex-col items-center justify-center py-4">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">Parsing file...</p>
        </div>
      ) : parseError ? (
        /* Error state */
        <div className="flex-1 flex flex-col text-left">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2 text-destructive">
              <X className="h-5 w-5" />
              <span className="font-medium">Parse Error</span>
            </div>
            <button
              onClick={handleClearFile}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-sm text-destructive/80 mb-3">{parseError}</p>
          <p className="text-xs text-muted-foreground mb-3">
            File: {selectedFile.name}
          </p>
          <div className="flex-1" />
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() => fileInputRef.current?.click()}
          >
            Try Another File
          </Button>
        </div>
      ) : (
        /* Success state - show dataset name input */
        <div className="flex-1 flex flex-col text-left">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2 text-[rgb(var(--theme-500))]">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">{parsedRecords.length} records</span>
            </div>
            <button
              onClick={handleClearFile}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground mb-4 truncate">
            {selectedFile.name}
          </p>
          <div className="flex-1" />
          <div className="space-y-3">
            <Input
              value={datasetName}
              onChange={(e) => setDatasetName(e.target.value)}
              placeholder="Dataset name"
              className="h-9"
            />
            <Button
              size="sm"
              className="w-full gap-2 bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white"
              onClick={handleCreateDataset}
              disabled={!datasetName.trim() || isCreating}
            >
              {isCreating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  Create Dataset
                  <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
