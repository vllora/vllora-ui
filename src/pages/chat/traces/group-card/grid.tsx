import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { GenericGroupDTO, isTimeGroup, isThreadGroup, isRunGroup } from '@/services/groups-api';
import { GroupCard } from '.';

// Grid layout for card stats - matches across all cards for alignment
// const CARD_STATS_GRID = 'auto 100px 100px 100px 100px 80px';

interface GroupCardGridProps {
  groups: GenericGroupDTO[];
  totalGroups: number;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  observerRef: React.RefObject<HTMLDivElement | null>;
}

export function GroupCardGrid({
  groups,
  totalGroups,
  hasMore,
  loadingMore,
  onLoadMore,
  observerRef,
}: GroupCardGridProps) {
  const PAGE_SIZE = 20;
  const currentPage = Math.ceil(groups.length / PAGE_SIZE) || 1;
  const totalPages = Math.ceil(totalGroups / PAGE_SIZE) || 1;
  const canGoPrevious = groups.length > PAGE_SIZE;
  const canGoNext = hasMore;

  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 7; // Show max 7 page buttons

    if (totalPages <= maxVisible) {
      // Show all pages if total is small
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);

      if (currentPage > 3) {
        pages.push('...');
      }

      // Show pages around current page
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (currentPage < totalPages - 2) {
        pages.push('...');
      }

      // Always show last page
      pages.push(totalPages);
    }

    return pages;
  };

  const pageNumbers = getPageNumbers();

  return (
    <div className="relative">
      <div className="px-6 py-4">
        <div className="grid grid-cols-1 gap-4">
        {groups.map((group, index) => {
          const key = isTimeGroup(group)
            ? `time-${group.group_key.time_bucket}`
            : isThreadGroup(group)
            ? `thread-${group.group_key.thread_id}`
            : isRunGroup(group)
            ? `run-${group.group_key.run_id}`
            : index;
          return <GroupCard key={key} group={group} index={index} />;
        })}

        {/* Observer target for infinite scroll */}
        {hasMore && <div ref={observerRef} className="h-px" />}
        </div>
      </div>

      {/* Sticky Footer with pagination */}
      {(hasMore || groups.length > 0) && (
        <div className="sticky bottom-0 z-10 bg-background/95 backdrop-blur-sm border-t border-border/50 px-6 py-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {groups.length} of {totalGroups} {totalGroups === 1 ? 'group' : 'groups'}
            </p>

            {loadingMore ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Loading...</span>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                {/* Previous button */}
                <button
                  onClick={() => {/* TODO: Implement go to previous page */}}
                  disabled={!canGoPrevious}
                  className="p-1.5 text-foreground hover:bg-accent/80 border border-border rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                {/* Page numbers */}
                {pageNumbers.map((page, index) => {
                  if (page === '...') {
                    return (
                      <span key={`ellipsis-${index}`} className="px-2 text-muted-foreground">
                        ...
                      </span>
                    );
                  }

                  const pageNum = page as number;
                  const isActive = pageNum === currentPage;

                  return (
                    <button
                      key={pageNum}
                      onClick={() => {/* TODO: Implement go to page */}}
                      disabled={isActive}
                      className={`min-w-[32px] px-2 py-1.5 text-sm font-medium rounded transition-colors ${
                        isActive
                          ? 'bg-muted text-foreground cursor-default'
                          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground border border-border'
                      }`}
                    >
                      {pageNum}
                    </button>
                  );
                })}

                {/* Next button */}
                <button
                  onClick={onLoadMore}
                  disabled={!canGoNext}
                  className="p-1.5 text-foreground hover:bg-accent/80 border border-border rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
