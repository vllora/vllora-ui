import { useState, useMemo } from 'react';
import { Tag, Search, ChevronDown, Loader2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { LabelInfo } from '@/services/labels-api';
import { LabelBadge } from './LabelBadge';
import { LabelTag } from '@/components/chat/traces/TraceRow/new-timeline/timeline-row/label-tag';

export interface LabelFilterProps {
  /** Selected labels */
  selectedLabels: string[];
  /** Callback when labels change */
  onLabelsChange: (labels: string[]) => void;
  /** Available labels with counts */
  availableLabels: LabelInfo[];
  /** Whether labels are loading */
  isLoading?: boolean;
  /** Placeholder text for the trigger button */
  placeholder?: string;
  /** Maximum labels to show in popover before scrolling */
  maxVisibleLabels?: number;
  /** Whether to show label counts */
  showCounts?: boolean;
  /** Custom class name */
  className?: string;
  /** Size variant */
  size?: 'sm' | 'default';
}

/**
 * LabelFilter component - Popover-based multi-select filter for labels
 *
 * Features:
 * - Search/filter labels
 * - Multi-select with checkboxes
 * - Shows label counts
 * - Selected labels as removable pills
 * - Clear all button
 */
export function LabelFilter({
  selectedLabels,
  onLabelsChange,
  availableLabels,
  isLoading = false,
  placeholder = 'Filter labels...',
  maxVisibleLabels = 10,
  showCounts = true,
  className,
  size = 'sm',
}: LabelFilterProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Filter labels based on search query
  const filteredLabels = useMemo(() => {
    if (!searchQuery.trim()) {
      return availableLabels;
    }
    const lowerQuery = searchQuery.toLowerCase();
    return availableLabels.filter(label =>
      label.name.toLowerCase().includes(lowerQuery)
    );
  }, [availableLabels, searchQuery]);

  // Toggle a label
  const toggleLabel = (labelName: string) => {
    if (selectedLabels.includes(labelName)) {
      onLabelsChange(selectedLabels.filter(l => l !== labelName));
    } else {
      onLabelsChange([...selectedLabels, labelName]);
    }
  };

  // Remove a label
  const removeLabel = (labelName: string) => {
    onLabelsChange(selectedLabels.filter(l => l !== labelName));
  };

  // Clear all labels
  const clearLabels = () => {
    onLabelsChange([]);
  };

  const hasSelection = selectedLabels.length > 0;

  return (
    <div className={cn('space-y-2', className)}>
      {/* Trigger Button + Popover */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size={size}
            className={cn(
              'w-full justify-between font-normal',
              size === 'sm' ? 'h-9 text-sm' : 'h-10 text-sm',
              !hasSelection && 'text-muted-foreground'
            )}
          >
            <span className="flex items-center gap-1.5">
              <Tag className={cn(size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
              {hasSelection
                ? `${selectedLabels.length} label${selectedLabels.length > 1 ? 's' : ''} selected`
                : placeholder}
            </span>
            <ChevronDown className={cn(
              'opacity-50 transition-transform',
              size === 'sm' ? 'h-4 w-4' : 'h-4 w-4',
              open && 'rotate-180'
            )} />
          </Button>
        </PopoverTrigger>

        <PopoverContent
          className="p-0"
          align="start"
          sideOffset={4}
          style={{ width: 'var(--radix-popover-trigger-width)' }}
        >
          {/* Search Input */}
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search labels..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-7 text-xs"
              />
            </div>
          </div>

          {/* Labels List */}
          <div className="max-h-48 overflow-y-auto p-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-4 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                <span className="text-xs">Loading labels...</span>
              </div>
            ) : filteredLabels.length === 0 ? (
              <div className="text-center py-4 text-xs text-muted-foreground">
                {searchQuery ? 'No labels match your search' : 'No labels available'}
              </div>
            ) : (
              <div className="space-y-1">
                {filteredLabels.slice(0, maxVisibleLabels).map((label) => {
                  const isSelected = selectedLabels.includes(label.name);
                  return (
                    <label
                      key={label.name}
                      className={cn(
                        'flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors',
                        'hover:bg-accent',
                        isSelected && 'bg-accent/50'
                      )}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleLabel(label.name)}
                        className="h-3.5 w-3.5"
                      />
                      <LabelTag label={label.name} maxWidth={120} />
                      {showCounts && (
                        <span className="text-[10px] text-muted-foreground tabular-nums ml-auto">
                          ({label.count})
                        </span>
                      )}
                    </label>
                  );
                })}
                {filteredLabels.length > maxVisibleLabels && (
                  <div className="text-center py-1 text-[10px] text-muted-foreground">
                    +{filteredLabels.length - maxVisibleLabels} more
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Clear All Button */}
          {hasSelection && (
            <div className="p-2 border-t">
              <Button
                variant="ghost"
                size="sm"
                className="w-full h-7 text-xs"
                onClick={() => {
                  clearLabels();
                  setOpen(false);
                }}
              >
                Clear all
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      {/* Selected Labels Pills */}
      {hasSelection && (
        <div className="flex flex-wrap gap-1">
          {selectedLabels.map((label) => (
            <LabelBadge
              key={label}
              label={label}
              onRemove={removeLabel}
              size="sm"
            />
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="h-4 px-1 text-[10px] text-muted-foreground hover:text-foreground"
            onClick={clearLabels}
          >
            Clear all
          </Button>
        </div>
      )}
    </div>
  );
}

export default LabelFilter;
