import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getColorFromLabel } from '@/components/chat/traces/TraceRow/new-timeline/timeline-row/label-tag';

export interface LabelBadgeProps {
  /** The label name to display */
  label: string;
  /** Callback when the badge is clicked (typically to remove) */
  onRemove?: (label: string) => void;
  /** Whether the badge is removable (shows X icon) */
  removable?: boolean;
  /** Custom class name */
  className?: string;
  /** Size variant */
  size?: 'sm' | 'default';
}

/**
 * LabelBadge component - Displays a label as a pill/badge with consistent colors
 *
 * Features:
 * - Consistent color based on label name (using getColorFromLabel)
 * - Shows label name with truncation
 * - Optional remove button (X icon)
 * - Click to remove functionality
 * - Size variants
 */
export function LabelBadge({
  label,
  onRemove,
  removable = true,
  className,
  size = 'sm',
}: LabelBadgeProps) {
  const colors = getColorFromLabel(label);

  const handleClick = () => {
    if (removable && onRemove) {
      onRemove(label);
    }
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded font-medium',
        size === 'sm' ? 'h-4 px-1 text-[10px]' : 'h-5 px-1 text-xs',
        removable && onRemove && 'cursor-pointer hover:opacity-80',
        className
      )}
      style={{
        backgroundColor: colors.background,
        color: colors.text,
      }}
      onClick={handleClick}
      title={label}
    >
      <span className="truncate max-w-[100px]">
        {label}
      </span>
      {removable && (
        <X className={cn(
          'shrink-0',
          size === 'sm' ? 'h-2.5 w-2.5' : 'h-3 w-3'
        )} />
      )}
    </span>
  );
}

export default LabelBadge;
