/**
 * SelectionBanner
 *
 * Gmail-style banner showing selection state with options to
 * select all matching or clear selection.
 */

export interface SelectionBannerProps {
  selectedCount: number;
  pageCount: number;
  totalCount: number;
  isAllMatchingSelected: boolean;
  onSelectAllMatching: () => void;
  onClearSelection: () => void;
}

export function SelectionBanner({
  selectedCount,
  pageCount,
  totalCount,
  isAllMatchingSelected,
  onSelectAllMatching,
  onClearSelection,
}: SelectionBannerProps) {
  if (selectedCount === 0) {
    return null;
  }

  return (
    <div className="px-4 py-2 bg-[rgb(var(--theme-500))]/10 border-b border-border text-sm flex-shrink-0">
      {isAllMatchingSelected ? (
        <span>
          All <strong>{totalCount}</strong> spans matching this filter are selected.{" "}
          <button
            onClick={onClearSelection}
            className="text-[rgb(var(--theme-500))] hover:underline font-medium"
          >
            Clear selection
          </button>
        </span>
      ) : selectedCount === pageCount ? (
        <span>
          All <strong>{pageCount}</strong> spans on this page are selected.{" "}
          {totalCount > pageCount && (
            <button
              onClick={onSelectAllMatching}
              className="text-[rgb(var(--theme-500))] hover:underline font-medium"
            >
              Select all {totalCount} spans matching this filter
            </button>
          )}
        </span>
      ) : (
        <span>
          <strong>{selectedCount}</strong> span{selectedCount > 1 ? "s" : ""} selected.{" "}
          <button
            onClick={onClearSelection}
            className="text-[rgb(var(--theme-500))] hover:underline font-medium"
          >
            Clear selection
          </button>
        </span>
      )}
    </div>
  );
}
