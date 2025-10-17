import { AlertCircle } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { CellWrapper } from './CellWrapper';

interface ErrorsCellProps {
  errors: string[];
}

export const ErrorsCell = ({ errors }: ErrorsCellProps) => {
  if (errors.length === 0) return <CellWrapper className="w-8"><div /></CellWrapper>;

  return (
    <CellWrapper className="justify-center w-8">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="cursor-help">
              <AlertCircle className="h-4 w-4 text-destructive" />
            </div>
          </TooltipTrigger>
          <TooltipContent className="flex flex-col gap-2 p-3 max-w-md">
            <div className="flex items-center gap-2 text-sm font-medium text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span>Errors ({errors.length})</span>
            </div>
            <div className="space-y-1">
              {errors.map((error, idx) => (
                <div
                  key={idx}
                  className="text-xs bg-destructive/10 px-2 py-1 rounded text-destructive"
                >
                  {error}
                </div>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </CellWrapper>
  );
};
