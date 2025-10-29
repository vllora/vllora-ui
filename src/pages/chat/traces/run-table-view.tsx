import { Loader2 } from 'lucide-react';
import { RunDTO } from '@/services/runs-api';
import { RunTableRow } from './run-table-row';
import { RunTableHeader } from './run-table-header';

interface RunTableViewProps {
  runs: RunDTO[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  observerRef: React.RefObject<HTMLDivElement | null>;
}

export function RunTableView({
  runs,
  hasMore,
  loadingMore,
  onLoadMore,
  observerRef,
}: RunTableViewProps) {
  return (
    <div className="px-2">
      {/* Table Header - Sticky */}
      <div className="sticky top-0 z-10">
        <RunTableHeader mode="run" />
      </div>

      {/* Table Rows */}
      <div className="divide-y divide-border">
        {runs.map((run, index) => (
          <RunTableRow key={run.run_id} run={run} index={index} />
        ))}

        {/* Load More Button */}
        {hasMore && (
          <button
            onClick={onLoadMore}
            disabled={loadingMore}
            className="w-full p-4 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-accent/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loadingMore ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading more traces...
              </span>
            ) : (
              `Load More (${runs.length} loaded)`
            )}
          </button>
        )}

        {/* Observer target for infinite scroll */}
        <div ref={observerRef} className="h-4" />
      </div>
    </div>
  );
}
