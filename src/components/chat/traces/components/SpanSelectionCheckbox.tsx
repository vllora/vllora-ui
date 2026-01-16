import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SpanSelectionCheckboxProps {
  spanId: string;
  isSelected: boolean;
  onToggle: (spanId: string) => void;
}

export const SpanSelectionCheckbox = ({
  spanId,
  isSelected,
  onToggle,
}: SpanSelectionCheckboxProps) => {
  return (
    <div
      className="flex items-center justify-center w-6 shrink-0 self-center px-1"
      onClick={(e) => {
        e.stopPropagation();
        onToggle(spanId);
      }}
    >
      <div
        className={cn(
          "h-4 w-4 rounded flex items-center justify-center cursor-pointer transition-all duration-150",
          "border",
          isSelected
            ? "bg-[rgb(var(--theme-500))] border-[rgb(var(--theme-500))]"
            : "bg-transparent border-muted-foreground/50 hover:border-muted-foreground"
        )}
      >
        {isSelected && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
      </div>
    </div>
  );
};
