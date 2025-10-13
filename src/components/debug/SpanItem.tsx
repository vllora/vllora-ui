import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Zap } from 'lucide-react';
import { Span } from '@/types/common-type';

interface SpanItemProps {
  span: Span;
}

// Format duration in ms
const formatDuration = (startUs: number, endUs: number): string => {
  const durationMs = (endUs - startUs) / 1000;
  if (durationMs < 1000) {
    return `${durationMs.toFixed(0)}ms`;
  }
  return `${(durationMs / 1000).toFixed(2)}s`;
};

export const SpanItem: React.FC<SpanItemProps> = ({ span }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="border-l-2 border-purple-500/30 ml-12 pl-4">
      <div
        className="flex items-center gap-2 py-2 cursor-pointer hover:bg-accent/5 rounded px-2"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex-shrink-0">
          {isExpanded ? (
            <ChevronDown className="w-3 h-3 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-3 h-3 text-muted-foreground" />
          )}
        </div>
        <Zap className="w-3 h-3 text-purple-400" />
        <span className="text-xs font-mono text-purple-400">{span.span_id?.substring(0, 8)}</span>
        <span className="text-xs text-foreground/80">{span.operation_name}</span>
        <span className="text-xs text-muted-foreground ml-auto">
          {formatDuration(span.start_time_us, span.finish_time_us)}
        </span>
      </div>

      {isExpanded && (
        <div className="ml-6 mt-1 mb-2 bg-muted/20 rounded p-2 text-xs font-mono">
          <pre className="text-foreground/70 overflow-x-auto">
            {JSON.stringify(
              {
                trace_id: span.trace_id,
                span_id: span.span_id,
                parent_span_id: span.parent_span_id,
                operation_name: span.operation_name,
                start_time: new Date(span.start_time_us / 1000).toISOString(),
                finish_time: new Date(span.finish_time_us / 1000).toISOString(),
                attribute: span.attribute,
              },
              null,
              2
            )}
          </pre>
        </div>
      )}
    </div>
  );
};
