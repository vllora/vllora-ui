/**
 * MetadataPanel
 *
 * Displays record metadata including assigned topic, available tools, and metadata fields.
 * Used in the expanded detail view of records.
 */

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { DatasetRecord, DataInfo } from "@/types/dataset-types";
import { ToolDefinitionsViewer } from "@/components/chat/traces/TraceRow/span-info/DetailView/tool-definitions-viewer";
import type { ToolInfoCall } from "@/components/chat/traces/TraceRow/span-info/DetailView/spans-display/tool-display";

interface MetadataPanelProps {
  record: DatasetRecord;
  topicPath: string[] | null;
}

export function MetadataPanel({ record, topicPath }: MetadataPanelProps) {
  const dataInfo = record.data as DataInfo | undefined;

  // Convert tools to ToolInfoCall format for ToolDefinitionsViewer
  const toolInfoCalls = useMemo((): ToolInfoCall[] => {
    const rawTools = dataInfo?.input?.tools;
    if (!rawTools || !Array.isArray(rawTools)) return [];

    return rawTools.map((tool: Record<string, unknown>) => ({
      type: (tool.type as string) || "function",
      id: tool.id as string | undefined,
      function: {
        name: (tool.function as Record<string, unknown>)?.name as string || (tool.name as string) || "Unknown",
        description: (tool.function as Record<string, unknown>)?.description as string || (tool.description as string) || "",
        parameters: (tool.function as Record<string, unknown>)?.parameters as Record<string, unknown> || (tool.parameters as Record<string, unknown>) || {},
      },
    }));
  }, [dataInfo?.input?.tools]);

  return (
    <div className="space-y-6">
      {/* Assigned Topic */}
      {topicPath && topicPath.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Assigned Topic
          </h4>
          <div className="text-sm font-medium text-[rgb(var(--theme-500))]">
            {topicPath[topicPath.length - 1]}
          </div>
          {topicPath.length > 1 && (
            <p className="text-xs text-zinc-500 mt-1">
              {topicPath.join(" > ")}
            </p>
          )}
        </div>
      )}

      {/* Available Tools */}
      {toolInfoCalls.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
            Available Tools
          </h4>
          <ToolDefinitionsViewer
            toolCalls={toolInfoCalls}
            showSection={false}
          />
        </div>
      )}

      {/* Metadata */}
      <div>
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
          Metadata
        </h4>
        <div className="space-y-0 divide-y divide-border/30">
          {record.evaluation?.score !== undefined && (
            <MetadataRow
              label="Quality Score"
              value={record.evaluation.score.toFixed(2)}
              valueColor="text-[rgb(var(--theme-500))]"
            />
          )}
          {record.is_generated && (
            <MetadataRow
              label="Type"
              value={record.is_generated ? "Generated" : "Recorded"}
              valueColor={record.is_generated ? "text-violet-400" : "text-blue-400"}
            />
          )}
          <MetadataRow
            label="Created"
            value={new Date(record.createdAt).toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          />
        </div>
      </div>
    </div>
  );
}

interface MetadataRowProps {
  label: string;
  value: string;
  valueColor?: string;
}

function MetadataRow({ label, value, valueColor = "text-foreground" }: MetadataRowProps) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <span className="text-sm text-zinc-500">{label}</span>
      <span className={cn("text-sm font-medium", valueColor)}>{value}</span>
    </div>
  );
}
