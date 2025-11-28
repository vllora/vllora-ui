import { useMemo } from "react";
import { extractOutput } from "@/utils/modelUtils";
import { ContentDisplay } from "./ContentDisplay";
import { EmptyOutputState } from "./EmptyOutputState";
import { ParsedMetadata } from "./OriginalOutputSection";
import { ModelContextViewer } from "../chat/traces/TraceRow/span-info/DetailView/spans-display/model-context-viewer";
import { formatCost } from "@/utils/formatCost";

interface NewOutputSectionProps {
  result: string | object[];
  running: boolean;
  isStreaming: boolean;
  info: {
    usage: string;
    cost: string;
    model: string;
  }
}


export function NewOutputSection({ result, running, isStreaming, info }: NewOutputSectionProps) {
 

  const metadata = useMemo((): ParsedMetadata => {
    try {
      const usageStr = typeof info.usage === "string" ? info.usage : JSON.stringify(info.usage);
      const parsed = JSON.parse(usageStr);
      return parsed
    } catch {
      return {};
    }
  }, [info.usage]);
  const costDisplay = useMemo(() => {
    try {
      const cost = typeof info.cost === "string" ? info.cost : JSON.stringify(info.cost);
      const costNumber = Number(cost);
      return formatCost(costNumber, 5);
    } catch {
      return "";
    }
  }, [info.cost]);

  // Empty state - no result and not running
  if (!result && !running) {
    return (
      <EmptyOutputState
        title="New Output"
        message="Run the experiment to see output"
      />
    );
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden h-full flex flex-col">
      <div className="px-3 py-2 bg-[rgb(var(--theme-500))]/10 border-b border-border flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          {running ? (
            <div className="w-2 h-2 rounded-full bg-[rgb(var(--theme-500))] animate-pulse" />
          ) : (
            <div className="w-2 h-2 rounded-full bg-[rgb(var(--theme-500))]" />
          )}
          <span className="text-xs font-medium">New Output</span>
          {running && (
            <span className="text-xs text-muted-foreground animate-pulse">
              {isStreaming ? "Streaming..." : "Waiting for response..."}
            </span>
          )}
        </div>
        {!running && (info.usage) && (
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            {info.model && <ModelContextViewer model_name={info.model} usage_tokens={metadata.total_tokens || 0} />}
            {metadata.total_tokens && (
              <span className="flex items-center gap-1">
                <span className="opacity-60">tokens:</span>
                <span className="font-medium">
                  {metadata.prompt_tokens || metadata.input_tokens || 0} + {metadata.completion_tokens || metadata.output_tokens || 0} = {metadata.total_tokens || 0}
                </span>
              </span>
            )}
            {costDisplay && info.cost && (<span className="flex items-center gap-1">
              <span className="opacity-60">cost:</span>
              <span className="font-medium">{costDisplay}</span>
            </span>)}
          </div>
        )}
      </div>
      <div className="p-3 flex-1 overflow-y-auto text-sm">
        {result ? (
          <ContentDisplay content={extractOutput(result)} />
        ) : running ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Waiting for response...</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
