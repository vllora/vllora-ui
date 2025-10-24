import { useLocalStorageState } from 'ahooks';
import { Play } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { DEBUG_CONTROL_KEY } from '@/hooks/events/useDebugControl';

export function DebugControl() {
  const [isPaused, setIsPaused] = useLocalStorageState(DEBUG_CONTROL_KEY, {
    defaultValue: false,
    listenStorageChange: true,
  });

  return (
    <TooltipProvider>
      {isPaused ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              onClick={() => setIsPaused(false)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 cursor-pointer hover:bg-amber-500/20 transition-colors"
            >
              <Play className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-[10px] font-medium text-amber-500">Paused</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Click to resume live events</p>
          </TooltipContent>
        </Tooltip>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              onClick={() => setIsPaused(true)}
              className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-green-500/10 border border-green-500/20 cursor-pointer hover:bg-green-500/20 transition-colors"
            >
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500"></span>
              </span>
              <span className="text-[10px] font-medium text-green-500">Live</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Click to pause live events</p>
          </TooltipContent>
        </Tooltip>
      )}
    </TooltipProvider>
  );
}
