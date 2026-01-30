/**
 * Chunked JSONL Parser
 *
 * Parses large JSONL files in chunks to avoid memory issues.
 * Supports both export format ({messages, tools}) and DataInfo format ({input, output}).
 */

import type { DataInfo } from "@/types/dataset-types";

// Supported JSONL record formats
export type JsonlRecordFormat = "export" | "datainfo" | "unknown";

export interface ParsedJsonlRecord {
  id: string;
  format: JsonlRecordFormat;
  // Normalized to DataInfo format for consistency
  data: DataInfo;
  // Original parsed JSON for reference
  raw: unknown;
}

export interface ParseProgress {
  bytesRead: number;
  totalBytes: number;
  recordsParsed: number;
  errors: number;
  percentage: number;
}

export interface ParseResult {
  records: ParsedJsonlRecord[];
  totalLines: number;
  errorLines: number[];
  detectedFormat: JsonlRecordFormat;
}

/**
 * Detect the format of a parsed JSON line
 */
function detectFormat(parsed: unknown): JsonlRecordFormat {
  if (!parsed || typeof parsed !== "object") return "unknown";

  const obj = parsed as Record<string, unknown>;

  // DataInfo format: has input and/or output with messages
  if (
    (obj.input && typeof obj.input === "object") ||
    (obj.output && typeof obj.output === "object")
  ) {
    return "datainfo";
  }

  // Export format: has messages array at top level
  if (Array.isArray(obj.messages)) {
    return "export";
  }

  return "unknown";
}

/**
 * Convert export format ({messages, tools}) to DataInfo format
 */
function exportFormatToDataInfo(parsed: Record<string, unknown>): DataInfo {
  const messages = (parsed.messages as unknown[]) || [];
  const tools = parsed.tools as unknown[] | undefined;

  // Split messages: all but last are input, last is output
  const inputMessages = messages.length > 1 ? messages.slice(0, -1) : messages;
  const outputMessage = messages.length > 1 ? messages[messages.length - 1] : undefined;

  return {
    input: {
      messages: inputMessages,
      tools: tools,
    },
    output: {
      messages: outputMessage,
    },
  };
}

/**
 * Normalize any format to DataInfo
 */
function normalizeToDataInfo(parsed: unknown, format: JsonlRecordFormat): DataInfo {
  if (format === "datainfo") {
    // Already in DataInfo format, just ensure structure
    const obj = parsed as Record<string, unknown>;
    return {
      input: (obj.input as DataInfo["input"]) || { messages: [] },
      output: (obj.output as DataInfo["output"]) || { messages: undefined },
    };
  }

  if (format === "export") {
    return exportFormatToDataInfo(parsed as Record<string, unknown>);
  }

  // Unknown format - wrap as-is
  return {
    input: { messages: [] },
    output: { messages: parsed },
  };
}

/**
 * Parse a JSONL file in chunks with progress reporting
 */
export async function parseJsonlChunked(
  file: File,
  onProgress?: (progress: ParseProgress) => void
): Promise<ParseResult> {
  const records: ParsedJsonlRecord[] = [];
  const errorLines: number[] = [];
  let detectedFormat: JsonlRecordFormat = "unknown";
  let lineNumber = 0;
  let buffer = "";

  const totalBytes = file.size;
  let bytesRead = 0;

  // Create a reader for the file
  const reader = file.stream().getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        // Process any remaining content in buffer
        if (buffer.trim()) {
          lineNumber++;
          try {
            const parsed = JSON.parse(buffer.trim());
            const format = detectFormat(parsed);
            if (detectedFormat === "unknown" && format !== "unknown") {
              detectedFormat = format;
            }
            records.push({
              id: `upload-${lineNumber - 1}`,
              format,
              data: normalizeToDataInfo(parsed, format),
              raw: parsed,
            });
          } catch {
            errorLines.push(lineNumber);
          }
        }
        break;
      }

      bytesRead += value.length;
      buffer += decoder.decode(value, { stream: true });

      // Process complete lines
      const lines = buffer.split("\n");
      // Keep the last incomplete line in buffer
      buffer = lines.pop() || "";

      for (const line of lines) {
        lineNumber++;
        const trimmed = line.trim();
        if (!trimmed) continue; // Skip empty lines

        try {
          const parsed = JSON.parse(trimmed);
          const format = detectFormat(parsed);
          if (detectedFormat === "unknown" && format !== "unknown") {
            detectedFormat = format;
          }
          records.push({
            id: `upload-${lineNumber - 1}`,
            format,
            data: normalizeToDataInfo(parsed, format),
            raw: parsed,
          });
        } catch {
          errorLines.push(lineNumber);
        }
      }

      // Report progress
      if (onProgress) {
        onProgress({
          bytesRead,
          totalBytes,
          recordsParsed: records.length,
          errors: errorLines.length,
          percentage: Math.round((bytesRead / totalBytes) * 100),
        });
      }
    }
  } finally {
    reader.releaseLock();
  }

  // Final progress report
  if (onProgress) {
    onProgress({
      bytesRead: totalBytes,
      totalBytes,
      recordsParsed: records.length,
      errors: errorLines.length,
      percentage: 100,
    });
  }

  return {
    records,
    totalLines: lineNumber,
    errorLines,
    detectedFormat,
  };
}

/**
 * Get a preview of records (first N) without parsing the entire file
 */
export async function previewJsonlFile(
  file: File,
  maxRecords: number = 100
): Promise<ParseResult> {
  const records: ParsedJsonlRecord[] = [];
  const errorLines: number[] = [];
  let detectedFormat: JsonlRecordFormat = "unknown";
  let lineNumber = 0;
  let buffer = "";

  const reader = file.stream().getReader();
  const decoder = new TextDecoder();

  try {
    while (records.length < maxRecords) {
      const { done, value } = await reader.read();

      if (done) {
        // Process remaining buffer
        if (buffer.trim()) {
          lineNumber++;
          try {
            const parsed = JSON.parse(buffer.trim());
            const format = detectFormat(parsed);
            if (detectedFormat === "unknown" && format !== "unknown") {
              detectedFormat = format;
            }
            records.push({
              id: `upload-${lineNumber - 1}`,
              format,
              data: normalizeToDataInfo(parsed, format),
              raw: parsed,
            });
          } catch {
            errorLines.push(lineNumber);
          }
        }
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (records.length >= maxRecords) break;
        lineNumber++;
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const parsed = JSON.parse(trimmed);
          const format = detectFormat(parsed);
          if (detectedFormat === "unknown" && format !== "unknown") {
            detectedFormat = format;
          }
          records.push({
            id: `upload-${lineNumber - 1}`,
            format,
            data: normalizeToDataInfo(parsed, format),
            raw: parsed,
          });
        } catch {
          errorLines.push(lineNumber);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return {
    records,
    totalLines: lineNumber,
    errorLines,
    detectedFormat,
  };
}

/**
 * Estimate total lines in a file (for progress display)
 */
export async function estimateLineCount(file: File): Promise<number> {
  // Sample first 1MB to estimate average line size
  const sampleSize = Math.min(file.size, 1024 * 1024);
  const slice = file.slice(0, sampleSize);
  const text = await slice.text();
  const sampleLines = text.split("\n").length;
  const avgLineSize = sampleSize / sampleLines;
  return Math.ceil(file.size / avgLineSize);
}
