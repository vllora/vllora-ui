/**
 * DataInfoExpandedDetail
 *
 * Inline expanded view for DataInfo records showing formatted thread and tools
 * in a 2-column layout. Used by SpansList and UploadedRecordsTable.
 */

import { useMemo } from "react";
import { MessageSquare, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DataInfo } from "@/types/dataset-types";
import { FormattedThreadPanel } from "../records-table/cells";
import { ToolDefinitionsViewer } from "@/components/chat/traces/TraceRow/span-info/DetailView/tool-definitions-viewer";
import type { ToolInfoCall } from "@/components/chat/traces/TraceRow/span-info/DetailView/spans-display/tool-display";

interface DataInfoExpandedDetailProps {
  data: DataInfo;
  className?: string;
}

export function DataInfoExpandedDetail({
  data,
  className,
}: DataInfoExpandedDetailProps) {
  // Convert tools to ToolInfoCall format for ToolDefinitionsViewer
  const toolInfoCalls = useMemo((): ToolInfoCall[] => {
    const rawTools = data?.input?.tools;
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
  }, [data?.input?.tools]);

  const hasTools = toolInfoCalls.length > 0;

  return (
    <div className={cn("bg-zinc-900/40", className)}>
      <div className={cn(
        "grid divide-x divide-border/30",
        hasTools ? "grid-cols-4" : "grid-cols-1"
      )}>
        {/* Formatted Thread Column - 3/4 width (or full if no tools) */}
        <div className={cn("flex flex-col", hasTools ? "col-span-3" : "col-span-1")}>
          <PanelHeader icon={MessageSquare} title="Formatted Thread" />
          <div className="p-4">
            <FormattedThreadPanel data={data} />
          </div>
        </div>

        {/* Tools Column - 1/4 width (only shown if tools exist) */}
        {hasTools && (
          <div className="col-span-1 flex flex-col">
            <PanelHeader icon={Wrench} title="Available Tools" />
            <div className="p-4">
              <ToolDefinitionsViewer
                toolCalls={toolInfoCalls}
                showSection={false}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface PanelHeaderProps {
  icon: React.ElementType;
  title: string;
}

function PanelHeader({ icon: Icon, title }: PanelHeaderProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/30 bg-zinc-900/60">
      <Icon className="w-4 h-4 text-muted-foreground" />
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {title}
      </span>
    </div>
  );
}
