import { Loader2, BugPlay, BugOff, Play, Square, ChevronDown } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { BreakpointsConsumer } from '@/contexts/breakpoints';

export function DebugModeToggle() {
  const { isDebugActive, isLoading, toggleDebugMode, continueAllBreakpoints, continueBreakpoint, breakpoints } = BreakpointsConsumer();

  // When debug mode is active, show debug toolbar
  if (isDebugActive) {
    return (
      <TooltipProvider>
        <div className="inline-flex items-center gap-1 bg-yellow-500/10 rounded-lg px-2 py-1 border border-yellow-500/20 h-[30px]">
          {/* Debug indicator */}
          <div className="flex items-center gap-1.5 pr-2 border-r border-yellow-500/30">
            <BugPlay className="w-3.5 h-3.5 text-yellow-500" />
            <span className="text-[10px] font-medium text-yellow-500">Debug</span>
            {breakpoints.length > 0 && (
              <span className="text-[10px] bg-yellow-500/20 text-yellow-500 px-1.5 py-0.5 rounded-full">
                {breakpoints.length}
              </span>
            )}
          </div>

          {/* Continue button with dropdown */}
          <DropdownMenu>
            <div className="flex items-center">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={continueAllBreakpoints}
                    className="p-1 rounded-l hover:bg-green-500/20 text-green-500 transition-colors"
                  >
                    <Play className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Continue All</p>
                </TooltipContent>
              </Tooltip>
              <DropdownMenuTrigger asChild>
                <button className="p-1 rounded-r hover:bg-green-500/20 text-green-500 transition-colors">
                  <ChevronDown className="w-3 h-3" />
                </button>
              </DropdownMenuTrigger>
            </div>
            <DropdownMenuContent align="start" className="min-w-[200px]">
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Breakpoints ({breakpoints.length})
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={continueAllBreakpoints}
                className="gap-2 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 text-green-500" />
                <span>Continue All</span>
              </DropdownMenuItem>
              {breakpoints.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs text-muted-foreground">
                    Individual Breakpoints
                  </DropdownMenuLabel>
                  {breakpoints.map((bp, index) => (
                    <DropdownMenuItem
                      key={bp.breakpoint_id}
                      onClick={() => continueBreakpoint(bp.breakpoint_id)}
                      className="gap-2 cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 text-yellow-500" />
                      <span className="truncate">Breakpoint {index + 1}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground font-mono">
                        {bp.breakpoint_id.slice(0, 8)}...
                      </span>
                    </DropdownMenuItem>
                  ))}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Stop Debug button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={toggleDebugMode}
                className="p-1 rounded hover:bg-red-500/20 text-red-500 transition-colors"
              >
                <Square className="w-3.5 h-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Stop Debug</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    );
  }

  // When debug mode is not active, show simple toggle button
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
