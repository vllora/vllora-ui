import React from 'react';
import { RunDTO } from '@/services/runs-api';

interface DetailedRunViewProps {
  run: RunDTO;
}

export const DetailedRunView: React.FC<DetailedRunViewProps> = ({ run }) => {
  return (
    <div className="p-4 space-y-4 bg-muted/20">
      {/* Run Details */}
      <div className="space-y-2">
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
        <div className="space-y-2">
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
        <div className="space-y-2">
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
      <div className="space-y-2">
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
        <div className="space-y-2">
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
