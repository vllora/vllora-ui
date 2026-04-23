/**
 * PlanModeToggle
 *
 * Toggle button group for switching between Preview and Edit modes.
 */

import { Eye, Edit3 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PlanModeToggleProps {
  isPreview: boolean;
  onToggle: (isPreview: boolean) => void;
}

export function PlanModeToggle({ isPreview, onToggle }: PlanModeToggleProps) {
  return (
    <div className="flex items-center gap-1 bg-muted/50 rounded-md p-0.5">
      <button
        onClick={() => onToggle(true)}
        className={cn(
          'px-2 py-1 text-xs rounded transition-colors flex items-center gap-1',
          isPreview
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <Eye className="w-3 h-3" />
        Preview
      </button>
      <button
        onClick={() => onToggle(false)}
        className={cn(
          'px-2 py-1 text-xs rounded transition-colors flex items-center gap-1',
          !isPreview
            ? 'bg-background text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <Edit3 className="w-3 h-3" />
        Edit
      </button>
    </div>
  );
}
