import { Loader2 } from 'lucide-react';
import { GroupDTO } from '@/services/groups-api';
import { GroupCard } from '.';

// Grid layout for card stats - matches across all cards for alignment
// const CARD_STATS_GRID = 'auto 100px 100px 100px 100px 80px';

interface GroupCardGridProps {
  groups: GroupDTO[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  observerRef: React.RefObject<HTMLDivElement | null>;
}

export function GroupCardGrid({
  groups,
  hasMore,
  loadingMore,
  onLoadMore,
  observerRef,
}: GroupCardGridProps) {
  return (
    <div className="px-6 py-4">
      <div className="grid grid-cols-1 gap-4">
        {groups.map((group, index) => (
          <GroupCard key={group.time_bucket} group={group} index={index} />
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
                Loading more groups...
              </span>
            ) : (
              `Load More (${groups.length} loaded)`
            )}
          </button>
        )}

        {/* Observer target for infinite scroll */}
        <div ref={observerRef} className="h-4" />
      </div>
    </div>
  );
}
