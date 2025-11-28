import { useMemo } from "react";
import { extractOutput } from "@/utils/modelUtils";
import { ContentDisplay } from "./ContentDisplay";
import { formatCost } from "@/utils/formatCost";
import { ModelContextViewer } from "../chat/traces/TraceRow/span-info/DetailView/spans-display/model-context-viewer";

interface OriginalOutputSectionProps {
  info: { 
    content: string | object[];
     usage?: string, 
     cost?: string,
     model?: string,
     }
}

export interface ParsedMetadata {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
    cache_creation_tokens?: number;
    [key: string]: any;
  };
}

export function OriginalOutputSection({ info }: OriginalOutputSectionProps) {
  // Try to parse content and extract usage/finish_reason

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

  if (!info.content) return null;

  return (
    <div className="rounded-lg flex-1 flex flex-col border border-dashed border-border overflow-hidden mt-4 flex-shrink-0">
      <div className="px-3 py-2 bg-muted/50 border-b border-dashed border-border flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Original Output
        </span>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          {/* {metadata.finish_reason && (
            <span className="flex items-center gap-1">
              <span className="opacity-60">finish:</span>
              <span className="font-medium">{metadata.finish_reason}</span>
            </span>
          )} */}
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
      </div>
      <div className="p-3 flex-1 overflow-y-scroll text-sm">
        <ContentDisplay
          content={extractOutput(info.content)}
          className="text-muted-foreground"
        />
      </div>
    </div>
  );
}
