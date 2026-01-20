import { CheckSquare, CheckCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SelectModeToggleProps {
  isEnabled: boolean;
  onToggle: () => void;
  selectedCount?: number;
  totalCount?: number;
  onSelectAll?: () => void;
}

export const SelectModeToggle = ({
  isEnabled,
  onToggle,
  selectedCount = 0,
  totalCount = 0,
  onSelectAll,
}: SelectModeToggleProps) => {
  const allSelected = totalCount > 0 && selectedCount === totalCount;

  return (
    <div className="flex items-center gap-1.5">
      <button
        onClick={onToggle}
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded-md border transition-all duration-200",
          "text-xs font-medium",
          isEnabled
            ? "bg-[rgb(var(--theme-500))]/10 border-[rgb(var(--theme-500))]/50 text-[rgb(var(--theme-500))]"
            : "bg-transparent border-border/50 text-muted-foreground hover:text-foreground hover:border-border"
        )}
      >
        <CheckSquare className="h-3.5 w-3.5" />
        <span>{isEnabled ? `${selectedCount} Selected` : 'Select'}</span>
      </button>

      {isEnabled && onSelectAll && totalCount > 0 && !allSelected && (
        <button
          onClick={onSelectAll}
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 rounded-md border transition-all duration-200",
            "text-xs font-medium",
            "bg-transparent border-border/50 text-muted-foreground hover:text-foreground hover:border-border hover:bg-muted/50"
          )}
        >
          <CheckCheck className="h-3.5 w-3.5" />
          <span>Select All ({totalCount})</span>
        </button>
      )}
    </div>
  );
};
