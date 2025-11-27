import { useMemo } from "react";
import { extractOutput } from "@/utils/modelUtils";
import { ContentDisplay } from "./ContentDisplay";
import { EmptyOutputState } from "./EmptyOutputState";

interface NewOutputSectionProps {
  result: string | object[];
  running: boolean;
  isStreaming: boolean;
}

interface ParsedMetadata {
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  finish_reason?: string;
}

export function NewOutputSection({ result, running, isStreaming }: NewOutputSectionProps) {
  // Try to parse result and extract usage/finish_reason
  
  console.log('==== NewOutputSection', result)
  const metadata = useMemo((): ParsedMetadata => {
    if (!result) return {};
    try {
      const contentStr = typeof result === "string" ? result : JSON.stringify(result);
      const parsed = JSON.parse(contentStr);

      return {
        usage: parsed.usage,
        finish_reason: parsed.choices?.[0]?.finish_reason,
      };
    } catch {
      return {};
    }
  }, [result]);

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
        {!running && (metadata.finish_reason || metadata.usage) && (
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
