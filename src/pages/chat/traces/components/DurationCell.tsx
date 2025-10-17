import { Timer } from 'lucide-react';
import {
  Tooltip,
  TooltipProvider,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { CellWrapper } from './CellWrapper';

interface DurationCellProps {
  duration: string;
  showDuration: boolean;
  combineTimeColumns: boolean;
  displayStartTime?: string;
  displayFinishTime?: string;
}

export const DurationCell = ({
  duration,
  showDuration,
  combineTimeColumns,
  displayStartTime,
  displayFinishTime,
}: DurationCellProps) => {
  if (!showDuration || combineTimeColumns) return null;

  const durationMs = parseFloat(duration) * 1000;

  return (
    <CellWrapper className="justify-center">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="font-medium text-xs tabular-nums text-white cursor-help">
              {duration}s
            </div>
          </TooltipTrigger>
          <TooltipContent className="flex flex-col gap-2 p-3 max-w-xs bg-background border border-border rounded-md shadow-md">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Timer className="h-4 w-4 text-purple-500" />
              <span>Duration Information</span>
            </div>
            <div className="space-y-2">
              {displayStartTime && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">Start time:</span>
                  <span className="text-xs font-mono">{displayStartTime}</span>
                </div>
              )}
              {displayFinishTime && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">End time:</span>
                  <span className="text-xs font-mono">{displayFinishTime}</span>
                </div>
              )}
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-border">
                <span className="text-xs font-medium">Duration:</span>
                <span className="text-xs font-mono">
                  {duration}s ({durationMs.toFixed(0)} ms)
                </span>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground italic mt-1">
              Times shown in your local timezone
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </CellWrapper>
  );
};
