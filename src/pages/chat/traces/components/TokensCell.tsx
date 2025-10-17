import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { CellWrapper } from './CellWrapper';

interface TokensCellProps {
  inputTokens: number;
  outputTokens: number;
  showTokens?: boolean;
}

export const TokensCell = ({
  inputTokens,
  outputTokens,
  showTokens = true,
}: TokensCellProps) => {
  if (!showTokens) return null;

  const total = inputTokens + outputTokens;

  return (
    <CellWrapper className="justify-center min-w-[100px]">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1 cursor-help">
              <div className="font-medium text-xs tabular-nums text-white">
                {total.toLocaleString()}
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent className="flex flex-col gap-3 p-3 max-w-sm bg-background border border-border rounded-md shadow-md">
            <div className="flex items-center gap-2 text-sm font-medium">
              <span>Token Usage Breakdown</span>
            </div>
            {/* Token breakdown */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Input tokens:</span>
                <Badge variant="outline" className="font-mono text-xs">
                  {inputTokens.toLocaleString()}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Output tokens:</span>
                <Badge variant="outline" className="font-mono text-xs">
                  {outputTokens.toLocaleString()}
                </Badge>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <span className="text-xs font-medium">Total tokens:</span>
                <Badge variant="secondary" className="font-mono text-blue-500">
                  {total.toLocaleString()}
                </Badge>
              </div>
            </div>

            {/* Usage ratios */}
            <div className="space-y-1 pt-2 border-t border-border">
              <div className="text-xs font-medium text-muted-foreground mb-1">
                Token Distribution:
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-green-500"
                    style={{
                      width: `${(inputTokens / total) * 100}%`,
                    }}
                  />
                </div>
                <span className="text-xs text-muted-foreground">
                  {Math.round((inputTokens / total) * 100)}% input
                </span>
              </div>
            </div>

            {/* Helpful info */}
            <div className="text-xs text-muted-foreground border-t border-border pt-2 space-y-1">
              <p>
                💡 <strong>Input tokens:</strong> prompt, context, and instructions
              </p>
              <p>
                💡 <strong>Output tokens:</strong> model's generated response
              </p>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </CellWrapper>
  );
};
