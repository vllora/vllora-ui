import { useLocalStorageState } from 'ahooks';
import { Play, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { DEBUG_CONTROL_KEY } from '@/hooks/events/useDebugControl';
import { ProjectEventsConsumer } from '@/contexts/project-events';

export function DebugControl() {
  const [isPaused, setIsPaused] = useLocalStorageState(DEBUG_CONTROL_KEY, {
    defaultValue: false,
    listenStorageChange: true,
  });

  const { isConnected, isConnecting, isRetrying, retryAttempt, error, startSubscription } = ProjectEventsConsumer();

  const handleRetry = () => {
    startSubscription();
  };

  // Determine the display state
  const getDisplayState = () => {
    if (isPaused) {
      return {
        label: 'Paused',
        color: 'amber',
        icon: <Play className="w-3.5 h-3.5 text-amber-500" />,
        tooltip: 'Click to resume live events',
        showPulse: false,
      };
    }

    if (isRetrying) {
      return {
        label: `Retrying (${retryAttempt}/5)`,
        color: 'orange',
        icon: <Loader2 className="w-3.5 h-3.5 text-orange-500 animate-spin" />,
        tooltip: `Retrying connection... Attempt ${retryAttempt} of 5`,
        showPulse: false,
      };
    }

    if (isConnecting) {
      return {
        label: 'Connecting',
        color: 'blue',
        icon: <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />,
        tooltip: 'Connecting to events...',
        showPulse: false,
      };
    }

    if (error || !isConnected) {
      return {
        label: 'Disconnected',
        color: 'red',
        icon: <AlertCircle className="w-3.5 h-3.5 text-red-500" />,
        tooltip: error ? `Connection error: ${error}` : 'Not connected to events',
        showPulse: false,
      };
    }

    return {
      label: 'Live',
      color: 'green',
      icon: null,
      tooltip: 'Click to pause live events',
      showPulse: true,
    };
  };

  const state = getDisplayState();
  const colorClasses = {
    amber: 'bg-amber-500/10 border-amber-500/20 hover:bg-amber-500/20 text-amber-500',
    blue: 'bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/20 text-blue-500',
    red: 'bg-red-500/10 border-red-500/20 hover:bg-red-500/20 text-red-500',
    green: 'bg-green-500/10 border-green-500/20 hover:bg-green-500/20 text-green-500',
    orange: 'bg-orange-500/10 border-orange-500/20 hover:bg-orange-500/20 text-orange-500',
  };

  // Show retry button for disconnected or retrying states
  const showRetryButton = (isRetrying || (error && !isConnected)) && !isPaused;

  return (
    <TooltipProvider>
      <div className="flex items-center gap-1.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              onClick={() => !isConnecting && !showRetryButton && setIsPaused(!isPaused)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md border transition-colors h-[30px] ${
                isConnecting || showRetryButton ? 'cursor-default' : 'cursor-pointer'
              } ${colorClasses[state.color as keyof typeof colorClasses]}`}
            >
              {state.showPulse ? (
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500"></span>
                </span>
              ) : (
                state.icon
              )}
              <span className="text-[10px] font-medium">{state.label}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>{state.tooltip}</p>
          </TooltipContent>
        </Tooltip>

        {showRetryButton && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleRetry}
                className="flex items-center justify-center w-6 h-6 rounded-md bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3 h-3 text-blue-500" />
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Retry connection</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}
