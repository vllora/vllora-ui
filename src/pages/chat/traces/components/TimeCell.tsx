import { Clock } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { CellWrapper } from './CellWrapper';

interface TimeCellProps {
  displayStartTime: string;
  displayFinishTime: string;
  duration: string;
  combineTimeColumns: boolean;
}

export const TimeCell = ({
  displayStartTime,
  displayFinishTime,
  duration,
  combineTimeColumns,
}: TimeCellProps) => {
  return (
    <CellWrapper className="justify-center">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex flex-1 flex-col w-full items-center cursor-help">
              <div className="font-medium text-xs tabular-nums text-white text-center">
                {displayStartTime}
              </div>
              {combineTimeColumns && (
                <div className="font-medium text-xs mt-2 border-t border-border pt-2 flex gap-1 tabular-nums">
                  <span className="text-xs text-muted-foreground">Duration:</span>
                  <span className="tabular-nums text-white text-xs">{duration}s</span>
                </div>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent className="flex flex-col gap-2 p-3 max-w-xs bg-background border border-border rounded-md shadow-md">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Clock className="h-4 w-4 text-purple-500" />
              <span>Time Information</span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Started:</span>
                <span className="text-xs font-mono">{displayStartTime}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Finished:</span>
                <span className="text-xs font-mono">{displayFinishTime}</span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-border">
                <span className="text-xs font-medium">Duration:</span>
                <Badge variant="outline" className="font-mono">
                  {duration}s
                </Badge>
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
