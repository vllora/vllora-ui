import { useRef } from 'react';
import { Loader2, Clock, DollarSign, Download, Upload, AlertTriangle } from 'lucide-react';
import { TracesPageConsumer } from '@/contexts/TracesPageContext';
import { RunTableRow } from './run-table-row';

export function RunTable() {
  const {
    runs,
    runsLoading,
    runsError,
    refreshRuns,
    loadMoreRuns,
    hasMoreRuns,
    loadingMoreRuns,
  } = TracesPageConsumer();

  const observerTarget = useRef<HTMLDivElement>(null);

  // Loading state
  if (runsLoading && runs.length === 0) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading traces...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (runsError && runs.length === 0) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <div className="flex flex-col items-center gap-3 max-w-md text-center">
          <p className="text-sm text-red-400">Failed to load traces</p>
          <p className="text-xs text-muted-foreground">{runsError.message}</p>
          <button
            onClick={refreshRuns}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Empty state
  if (!runsLoading && runs.length === 0) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <div className="flex flex-col items-center gap-3">
          <p className="text-sm text-muted-foreground">No traces found</p>
          <p className="text-xs text-muted-foreground/70">
            Traces will appear here as your application runs
          </p>
        </div>
      </div>
    );
  }

  // Runs list
  return (
    <div className="flex-1 w-full overflow-auto">
      <div className="divide-y divide-border">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-0 bg-[#0a0a0a] text-xs font-semibold text-muted-foreground uppercase tracking-wider overflow-hidden">
          <div className="col-span-1 flex items-center justify-center py-3 px-2 border-r border-border">
            
          </div>
          <div className="col-span-2 py-3 px-3 border-r border-border">Run ID</div>
          <div className="col-span-2 py-3 px-3 border-r border-border">Provider</div>
          <div className="col-span-2 flex items-center gap-1 py-3 px-3 border-r border-border">
            <Clock className="w-3.5 h-3.5" />
            Time
          </div>
          <div className="col-span-1 flex items-center gap-1 py-3 px-2 border-r border-border justify-center">
            <DollarSign className="w-3.5 h-3.5" />
            Cost
          </div>
          <div className="col-span-1 flex items-center gap-1 py-3 px-2 border-r border-border justify-center">
            <Upload className="w-3.5 h-3.5" />
            Input
          </div>
          <div className="col-span-1 flex items-center gap-1 py-3 px-2 border-r border-border justify-center">
            <Download className="w-3.5 h-3.5" />
            Output
          </div>
          <div className="col-span-1 flex items-center gap-1 py-3 px-2 border-r border-border justify-center">
            <Clock className="w-3.5 h-3.5" />
            Duration
          </div>
          <div className="col-span-1 flex items-center gap-1 py-3 px-2 justify-center">
            <AlertTriangle className="w-3.5 h-3.5" />
            Errors
          </div>
        </div>

        {/* Table Rows */}
        {runs.map((run, index) => (
          <RunTableRow key={run.run_id} run={run} index={index} />
        ))}

        {/* Load More Button */}
        {hasMoreRuns && (
          <button
            onClick={loadMoreRuns}
            disabled={loadingMoreRuns}
            className="w-full p-4 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-accent/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loadingMoreRuns ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading more traces...
              </span>
            ) : (
              `Load More (${runs.length} loaded)`
            )}
          </button>
        )}

        {/* Observer target for infinite scroll (optional future enhancement) */}
        <div ref={observerTarget} className="h-4" />
      </div>
    </div>
  );
}
