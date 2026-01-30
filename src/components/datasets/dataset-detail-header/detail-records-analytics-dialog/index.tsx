/**
 * RecordsAnalyticsDialog
 *
 * Dialog showing detailed dataset analytics fetched from the server.
 * Displays quality metrics, data distribution, and other insights.
 */

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getDryRunAnalytics, type DryRunAnalyticsResponse } from "@/services/finetune-api";
import type { DatasetRecord, DataInfo } from "@/types/dataset-types";
import { LoadingState, ErrorState, EmptyState } from "../DialogStates";
import { AnalyticsContent } from "./AnalyticsContent";

/**
 * Transform a DatasetRecord to the format expected by the analytics API.
 * The API expects rows with a `messages` array and optionally a `topic` field.
 */
function transformRecordToApiFormat(record: DatasetRecord): { messages: unknown[]; topic?: string } | null {
  const data = record.data;
  if (!data || typeof data !== "object") return null;

  let messages: unknown[] = [];

  // If data already has messages at top level, use it
  if ("messages" in data && Array.isArray((data as { messages: unknown[] }).messages)) {
    messages = (data as { messages: unknown[] }).messages;
  } else {
    // If data is in DataInfo format (input/output structure), combine messages
    const dataInfo = data as DataInfo;

    // Add input messages
    if (dataInfo.input?.messages && Array.isArray(dataInfo.input.messages)) {
      messages.push(...dataInfo.input.messages);
    }

    // Add output messages (could be array or single message)
    if (dataInfo.output?.messages) {
      if (Array.isArray(dataInfo.output.messages)) {
        messages.push(...dataInfo.output.messages);
      } else {
        messages.push(dataInfo.output.messages);
      }
    }

    // If we have tool_calls in output, add as assistant message
    if (dataInfo.output?.tool_calls && Array.isArray(dataInfo.output.tool_calls)) {
      messages.push({
        role: "assistant",
        tool_calls: dataInfo.output.tool_calls,
      });
    }
  }

  if (messages.length === 0) return null;

  // Include topic from record if present
  return record.topic
    ? { messages, topic: record.topic }
    : { messages };
}

export interface RecordsAnalyticsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  records: DatasetRecord[];
}

export function RecordsAnalyticsDialog({
  open,
  onOpenChange,
  records,
}: RecordsAnalyticsDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analytics, setAnalytics] = useState<DryRunAnalyticsResponse | null>(null);

  // Fetch analytics when dialog opens
  useEffect(() => {
    if (!open || records.length === 0) {
      return;
    }

    const fetchAnalytics = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // Transform records to the format expected by the API (includes topic)
        const rows = records
          .map((r) => transformRecordToApiFormat(r))
          .filter((row): row is { messages: unknown[]; topic?: string } => row !== null);

        if (rows.length === 0) {
          setError("No valid records to analyze");
          return;
        }

        const response = await getDryRunAnalytics(rows);
        setAnalytics(response);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch analytics");
      } finally {
        setIsLoading(false);
      }
    };

    fetchAnalytics();
  }, [open, records]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setAnalytics(null);
      setError(null);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Dataset Analytics</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <LoadingState message="Analyzing dataset..." />
        ) : error ? (
          <ErrorState message={error} />
        ) : analytics ? (
          <AnalyticsContent analytics={analytics} />
        ) : (
          <EmptyState
            message={records.length === 0 ? "No records to analyze" : "Loading analytics..."}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
