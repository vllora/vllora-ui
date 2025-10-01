import React from "react";
import { cn } from "@/lib/utils";
import { Span } from "@/services/runs-api";

interface TimelineContentProps {
  rootSpans: Span[];
}

export const TimelineContent: React.FC<TimelineContentProps> = ({
  rootSpans,
}) => {
  return (
    <div className={cn("flex flex-col h-full overflow-hidden")}>
      {/* Timeline Content */}
      <div className={cn("flex-1 overflow-auto mt-2", "bg-[#0f0f0f] px-2")}>
        {rootSpans.length > 0 ? (
          <div className="space-y-2">
            {rootSpans.map((span) => {
              const duration = ((span.finish_time_us - span.start_time_us) / 1000000).toFixed(3);
              return (
                <div
                  key={span.span_id}
                  className="flex items-center gap-3 p-3 rounded bg-[#1a1a1a] border border-[#262626] hover:border-[#333333] transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-mono text-blue-400">
                        {span.operation_name}
                      </span>
                      {span.attribute && 'model_name' in span.attribute && (
                        <span className="text-xs px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                          {span.attribute.model_name as string}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      Span ID: {span.span_id}
                    </div>
                    {span.attribute && 'error' in span.attribute && span.attribute.error && (
                      <div className="mt-2 text-xs text-red-400 bg-red-900/20 border border-red-500/30 rounded px-2 py-1">
                        {span.attribute.error as string}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <div className="text-xs font-mono text-amber-400">{duration}s</div>
                    {span.parent_span_id && (
                      <div className="text-[10px] text-muted-foreground">
                        Parent: {span.parent_span_id.slice(0, 8)}...
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center justify-center p-4 text-sm text-gray-400">
            No spans available for this run
          </div>
        )}
      </div>
    </div>
  );
};
