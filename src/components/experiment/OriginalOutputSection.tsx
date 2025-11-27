import { useMemo } from "react";
import { extractOutput } from "@/utils/modelUtils";
import { ContentDisplay } from "./ContentDisplay";

interface OriginalOutputSectionProps {
  content: string | object[];
}

interface ParsedMetadata {
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  finish_reason?: string;
}

export function OriginalOutputSection({ content }: OriginalOutputSectionProps) {
  // Try to parse content and extract usage/finish_reason
  const metadata = useMemo((): ParsedMetadata => {
    try {
      const contentStr = typeof content === "string" ? content : JSON.stringify(content);
      const parsed = JSON.parse(contentStr);

      return {
        usage: parsed.usage,
        finish_reason: parsed.choices?.[0]?.finish_reason,
      };
    } catch {
      return {};
    }
  }, [content]);

  if (!content) return null;

  return (
    <div className="rounded-lg flex-1 flex flex-col border border-dashed border-border overflow-hidden mt-4 flex-shrink-0">
      <div className="px-3 py-2 bg-muted/50 border-b border-dashed border-border flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Original Output
        </span>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          {metadata.finish_reason && (
            <span className="flex items-center gap-1">
              <span className="opacity-60">finish:</span>
              <span className="font-medium">{metadata.finish_reason}</span>
            </span>
          )}
          {metadata.usage && (
            <span className="flex items-center gap-1">
              <span className="opacity-60">tokens:</span>
              <span className="font-medium">
                {metadata.usage.prompt_tokens ?? 0} + {metadata.usage.completion_tokens ?? 0} = {metadata.usage.total_tokens ?? 0}
              </span>
            </span>
          )}
        </div>
      </div>
      <div className="p-3 flex-1 overflow-y-scroll text-sm">
        <ContentDisplay
          content={extractOutput(content)}
          className="text-muted-foreground"
        />
      </div>
    </div>
  );
}
