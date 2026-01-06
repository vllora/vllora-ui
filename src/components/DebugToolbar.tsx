import { BugPlay, Play, Square } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

import { BreakpointsConsumer } from '@/contexts/breakpoints';

export function DebugToolbar() {
  const { toggleDebugMode, continueAllBreakpoints, breakpoints } = BreakpointsConsumer();

  return (
    <TooltipProvider>
      <div className="inline-flex items-center gap-1 bg-border rounded-lg px-2 py-1 border  h-[30px]">
        {/* Debug indicator */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 pr-2 border-r border-yellow-500/30 cursor-default">
              <BugPlay className="w-3.5 h-3.5 text-yellow-500" />
              {breakpoints.length > 0 && (
                <span className="text-[10px] bg-yellow-500/20 text-yellow-500 px-1.5 py-0.5 rounded-full">
                  {breakpoints.length}
                </span>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Debug Mode Active{breakpoints.length > 0 ? ` (${breakpoints.length} breakpoint${breakpoints.length > 1 ? 's' : ''})` : ''}</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={continueAllBreakpoints}
              disabled={breakpoints.length < 1}
              className="p-1 rounded-l hover:bg-green-500/20 text-green-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
            >
              <Play className="w-3.5 h-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{breakpoints.length < 1 ? 'No breakpoints to continue' : 'Continue All'}</p>
          </TooltipContent>
        </Tooltip>

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
            <p>Exit debug mode & resume all</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
