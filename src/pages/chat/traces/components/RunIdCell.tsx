import { Hash } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { CellWrapper } from './CellWrapper';

interface RunIdCellProps {
  runId: string;
}

export const RunIdCell = ({ runId }: RunIdCellProps) => {
  const displayId = runId.length > 8 ? `${runId.slice(0, 8)}...` : runId;

  return (
    <CellWrapper className="justify-center min-w-[120px]">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="cursor-help font-mono text-xs text-white">
              {displayId}
            </div>
          </TooltipTrigger>
          <TooltipContent className="flex flex-col gap-2 p-3 max-w-xs bg-background border border-border rounded-md shadow-md">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Hash className="h-4 w-4 text-primary" />
              <span>Run ID</span>
            </div>
            <div className="px-2 py-1 bg-muted rounded text-xs font-mono break-all">
              {runId}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </CellWrapper>
  );
};
