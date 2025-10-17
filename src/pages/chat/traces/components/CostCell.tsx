import { DollarSign } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { formatMoney } from '@/utils/format';
import { CellWrapper } from './CellWrapper';

interface CostCellProps {
  cost: number;
}

export const CostCell = ({ cost }: CostCellProps) => {
  return (
    <CellWrapper className="justify-center min-w-[80px]">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="font-medium text-xs tabular-nums text-white cursor-help">
              {formatMoney(cost)}
            </div>
          </TooltipTrigger>
          <TooltipContent className="flex flex-col gap-3 p-3 max-w-sm bg-background border border-border rounded-md shadow-md">
            <div className="flex items-center gap-2 text-sm font-medium">
              <DollarSign className="h-4 w-4 text-green-500" />
              <span>Cost Breakdown</span>
            </div>

            {/* Cost display */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Total cost:</span>
                <Badge variant="secondary" className="font-mono text-green-500 text-sm">
                  {formatMoney(cost)}
                </Badge>
              </div>
            </div>

            {/* Cost optimization tips */}
            <div className="space-y-1 pt-2 border-t border-border">
              <div className="text-xs font-medium text-muted-foreground mb-1">
                🚀 Cost Optimization Tips:
              </div>
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>
                  • <strong>Reduce context:</strong> Shorter prompts cost less
                </p>
                <p>
                  • <strong>Choose models:</strong> Smaller models for simple tasks
                </p>
                <p>
                  • <strong>Batch requests:</strong> Fewer API calls when possible
                </p>
                <p>
                  • <strong>Cache results:</strong> Avoid repeating identical requests
                </p>
              </div>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </CellWrapper>
  );
};
