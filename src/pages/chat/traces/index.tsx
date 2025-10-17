import { useEffect, useRef, useCallback } from 'react';
import { ProjectsConsumer } from '@/contexts/ProjectContext';
import { useRunPagination } from '@/hooks/useRunPagination';
import { Button } from '@/components/ui/button';
import { RefreshCw, Loader2 } from 'lucide-react';
import { RunRow } from './components/RunRow';
import { CellWrapper } from './components/CellWrapper';

export const TracesPage = () => {
  const { currentProjectId } = ProjectsConsumer();
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const { runs, loading, loadingMore, error, hasMore, total, refreshRuns, loadMoreRuns } =
    useRunPagination({
      projectId: currentProjectId || '',
    });

  // Load initial data
  useEffect(() => {
    if (currentProjectId) {
      refreshRuns();
    }
  }, [currentProjectId, refreshRuns]);

  // Handle scroll for infinite loading
  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current || loadingMore || !hasMore) return;

    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;

    if (scrollPercentage > 0.8) {
      loadMoreRuns();
    }
  }, [loadMoreRuns, loadingMore, hasMore]);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  if (!currentProjectId) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">No project selected</div>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col flex-1 h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-muted/20">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Traces</h2>
          <span className="text-sm text-muted-foreground">({total} total)</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={refreshRuns}
          disabled={loading}
          className="gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Column Headers */}
      <div className="flex items-stretch border-b border-border bg-muted/30 text-xs font-medium text-muted-foreground">
        <CellWrapper className="justify-center min-w-[120px]">Run ID</CellWrapper>
        <CellWrapper className="justify-start  min-w-[150px]">Models</CellWrapper>
        <CellWrapper className="justify-center min-w-[100px]">Tokens</CellWrapper>
        <CellWrapper className="justify-center min-w-[80px]">Cost</CellWrapper>
        <CellWrapper className="justify-center">Time</CellWrapper>
        <CellWrapper className="justify-center">Duration</CellWrapper>
        <CellWrapper className="justify-center w-8">
          <div />
        </CellWrapper>
      </div>

      {/* Content */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
        {loading && runs.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <p className="text-destructive font-medium">Error loading runs</p>
              <p className="text-sm text-muted-foreground mt-1">{error}</p>
            </div>
          </div>
        ) : runs.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <p className="text-lg font-medium text-muted-foreground">No runs found</p>
              <p className="text-sm text-muted-foreground mt-1">
                Start making requests to see traces here
              </p>
            </div>
          </div>
        ) : (
          <>
            {runs.map((run) => (
              <RunRow key={run.run_id || Math.random()} run={run} />
            ))}
            {loadingMore && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
