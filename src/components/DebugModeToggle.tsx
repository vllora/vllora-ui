import { Loader2, BugOff } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { BreakpointsConsumer } from '@/contexts/breakpoints';
import { DebugToolbar } from './DebugToolbar';
import { CurrentAppConsumer } from '@/lib';

export function DebugModeToggle() {
  const { isDebugActive, isLoading, toggleDebugMode } = BreakpointsConsumer();
  const { app_mode } = CurrentAppConsumer()

  if (app_mode === 'langdb') {
    return
  }
  if (isDebugActive) {
    return <DebugToolbar />;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={toggleDebugMode}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md border transition-colors h-[30px] cursor-pointer bg-muted/50 border-border hover:bg-muted text-muted-foreground"
          >
            {isLoading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <BugOff className="w-3.5 h-3.5" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Enable debug mode</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
