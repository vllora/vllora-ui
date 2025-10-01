import React from 'react';
import { RunDTO, Span } from '@/services/runs-api';
import { ChatWindowConsumer } from '@/contexts/ChatWindowContext';
import { AlertCircle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TimelineContent } from '../TimelineContent';

interface DetailedRunViewProps {
  run: RunDTO;
}

export const DetailedRunView: React.FC<DetailedRunViewProps> = ({ run }) => {
  const { spanMap, loadingSpansById } = ChatWindowConsumer();
  const spansOfRun: Span[] = (run.run_id && spanMap[run.run_id]) || [];
  const isLoadingSpans = run.run_id ? loadingSpansById.has(run.run_id) : false;
  console.log('==== spanMap', spanMap);
  console.log('==== spansOfRun', spansOfRun);
  // Loading state when fetching spans
  if (isLoadingSpans && spansOfRun.length === 0) {
    return (
      <div className="p-4 bg-[#171717]">
        <div className="flex items-center justify-center py-8">
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-blue-400 animate-spin" />
            <span className="text-sm text-gray-400">Loading execution details...</span>
          </div>
        </div>
      </div>
    );
  }

  // Empty state when no spans are available
  if (!isLoadingSpans && spansOfRun.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 px-4 bg-[#0a0a0a] border border-[#262626] rounded-lg mx-4 my-2">
        <div className="flex items-center justify-center w-12 h-12 bg-[#1a1a1a] rounded-full mb-4">
          <AlertCircle className="w-6 h-6 text-amber-500" />
        </div>
        <h3 className="text-lg font-medium text-gray-200 mb-2">No Execution Details</h3>
        <p className="text-sm text-gray-400 text-center max-w-md">
          This run completed but no detailed execution traces were recorded.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-3 py-2")}>
      {/* Execution Timeline Section - Full Width */}
      {spansOfRun.length > 0 && (
        <div className="overflow-hidden">
          <div className="overflow-hidden relative">
            <TimelineContent rootSpans={spansOfRun} />
          </div>
        </div>
      )}

      {/* Run Details */}
      <div className="space-y-2 mx-2">
        <h4 className="text-sm font-semibold text-foreground">Run Details</h4>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <span className="text-muted-foreground">Run ID:</span>
            <p className="font-mono mt-0.5">{run.run_id}</p>
          </div>
          {run.thread_ids && run.thread_ids.length > 0 && (
            <div>
              <span className="text-muted-foreground">Thread IDs:</span>
              <p className="font-mono mt-0.5">{run.thread_ids.join(', ')}</p>
            </div>
          )}
          {run.trace_ids && run.trace_ids.length > 0 && (
            <div className="col-span-2">
              <span className="text-muted-foreground">Trace IDs:</span>
              <p className="font-mono mt-0.5 break-all">
                {run.trace_ids.slice(0, 3).join(', ')}
                {run.trace_ids.length > 3 && ` (+${run.trace_ids.length - 3} more)`}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Models */}
      {run.used_models && run.used_models.length > 0 && (
        <div className="space-y-2 mx-2">
          <h4 className="text-sm font-semibold text-foreground">Models Used</h4>
          <div className="flex flex-wrap gap-2">
            {run.used_models.map((model, idx) => (
              <span
                key={idx}
                className="text-xs px-2 py-1 rounded bg-primary/10 text-primary border border-primary/20"
              >
                {model}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tools */}
      {run.used_tools && run.used_tools.length > 0 && (
        <div className="space-y-2 mx-2">
          <h4 className="text-sm font-semibold text-foreground">Tools Used</h4>
          <div className="flex flex-wrap gap-2">
            {run.used_tools.map((tool, idx) => (
              <span
                key={idx}
                className="text-xs px-2 py-1 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20"
              >
                {tool}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Metrics */}
      <div className="space-y-2 mx-2">
        <h4 className="text-sm font-semibold text-foreground">Metrics</h4>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="p-2 rounded bg-background border border-border">
            <span className="text-muted-foreground block mb-1">Input Tokens</span>
            <span className="text-lg font-semibold">{run.input_tokens || 0}</span>
          </div>
          <div className="p-2 rounded bg-background border border-border">
            <span className="text-muted-foreground block mb-1">Output Tokens</span>
            <span className="text-lg font-semibold">{run.output_tokens || 0}</span>
          </div>
          {run.cost !== undefined && run.cost > 0 && (
            <div className="p-2 rounded bg-background border border-border col-span-2">
              <span className="text-muted-foreground block mb-1">Total Cost</span>
              <span className="text-lg font-semibold">${run.cost.toFixed(6)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Errors */}
      {run.errors && run.errors.length > 0 && (
        <div className="space-y-2 mx-2">
          <h4 className="text-sm font-semibold text-foreground">Errors</h4>
          <div className="space-y-2">
            {run.errors.map((error, idx) => (
              <div
                key={idx}
                className="p-3 rounded bg-red-900/20 border border-red-500/30 text-xs text-red-400"
              >
                <pre className="whitespace-pre-wrap font-mono">{error}</pre>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
