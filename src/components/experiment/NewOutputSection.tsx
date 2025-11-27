import { ContentDisplay } from "./ContentDisplay";
import { EmptyOutputState } from "./EmptyOutputState";

interface NewOutputSectionProps {
  result: string;
  running: boolean;
  isStreaming: boolean;
}

export function NewOutputSection({ result, running, isStreaming }: NewOutputSectionProps) {
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
      <div className="px-3 py-2 bg-[rgb(var(--theme-500))]/10 border-b border-border flex items-center gap-2 flex-shrink-0">
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
      <div className="p-3 flex-1 overflow-y-auto text-sm">
        {result ? (
          <ContentDisplay content={result} />
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
