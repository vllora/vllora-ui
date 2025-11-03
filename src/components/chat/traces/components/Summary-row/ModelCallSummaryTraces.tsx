import React, { useCallback, useMemo } from "react";
import { RunDTO } from "@/types/common-type";
import { Card } from "@/components/ui/card";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  Tooltip,
  TooltipProvider,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatCost } from "@/utils/formatCost";
import { ChatWindowConsumer } from "@/contexts/ChatWindowContext";
import { formatMessageTime } from "@/utils/dateUtils";
import { useRelativeTime } from "@/hooks/useRelativeTime";
import { ListProviders } from "@/components/chat/thread/ListProviders";

interface ModelCallSummaryTracesProps {
  run: RunDTO;
  isOpen?: boolean;
  isInSidebar?: boolean;
  onChevronClick?: () => void;
}

const SidebarModelCallSummaryTracesImpl = ({
  run,
  isOpen,
  onChevronClick,
}: ModelCallSummaryTracesProps) => {
  const { runHighlighted } = ChatWindowConsumer();
  const runId = run.run_id || "";
  const isHighlighted = runHighlighted === runId;

  // Extract models and providers
  const usedModels = run.used_models || [];
  const requestModels = run.request_models || [];
  const combineModels = [...usedModels, ...requestModels.filter(n => n.includes('/'))];
  const uniqueModels = Array.from(new Set(combineModels));

  // Sort langdb models to the top
  uniqueModels.sort((a, b) => {
    if (a.startsWith("langdb")) return -1;
    if (b.startsWith("langdb")) return 1;
    return 0;
  });

  const modelNamesInvoked = uniqueModels.filter(name => name && typeof name === 'string' && name.trim() !== '');

  const tokensInfo = {
    inputTokens: run.input_tokens || 0,
    outputTokens: run.output_tokens || 0,
    totalTokens: (run.input_tokens || 0) + (run.output_tokens || 0),
  };

  const totalCost = run.cost || 0;
  const errors = run.errors || [];
  const startTime = run.start_time_us;
  const finishTime = run.finish_time_us;
  const startTimeMs = startTime / 1000;
  const finishTimeMs = finishTime / 1000;

  const getDurations = (startMs: number, finishMs: number) => {
    return ((finishMs - startMs) / 1000).toFixed(2);
  };

  const messageRef = React.useRef<HTMLDivElement>(null);


  const duration = finishTime && startTime ? getDurations(startTimeMs, finishTimeMs) : "0.00";

  const handleCardClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onChevronClick?.();
    },
    [onChevronClick]
  );

  const startTimeInIsoFormat = useMemo(() => {
    if (!startTime) return "";
    const traceDate = new Date(startTime / 1000);
    return traceDate.toISOString();
  }, [startTime]);

  useRelativeTime(messageRef, startTimeInIsoFormat);

  // Extract provider info from input_models
  const providersInfo = useMemo(() => {
    const inputModels = modelNamesInvoked || [];
    const providersMap: { provider: string, models: string[] }[] = [];

    inputModels.forEach(modelFullName => {
      if (modelFullName && modelFullName.includes('/')) {
        const [provider, model] = modelFullName.split('/');
        const existingProviderIndex = providersMap.findIndex(p => p.provider === provider);
        if (existingProviderIndex !== -1) {
          providersMap[existingProviderIndex].models.push(model);
        } else {
          providersMap.push({ provider: provider, models: [model] });
        }
      }
    });

    return providersMap;
  }, [modelNamesInvoked]);


  // Improved time display with better granularity for older traces
  const getTimeDisplay = useCallback(() => {
    if (!startTime) return "";
    return formatMessageTime(startTimeInIsoFormat);
  }, [startTimeInIsoFormat]);

  const timeAgoInSidebar = getTimeDisplay();

  const convertTimeMiliSecondsToLocalDateTime = (ms: number, includeSeconds: boolean = false) => {
    const date = new Date(ms);
    return includeSeconds
      ? date.toLocaleString()
      : date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };


  return (
    <Card
      onClick={handleCardClick}
      data-run-id={runId}
      className={cn(
        "py-2 hover:bg-[#171717] bg-[#161616] transition-all flex px-3 cursor-pointer",
        isOpen && "bg-[#171717]",
        isHighlighted ? " border-r-0 border-y-0 border-l-4 border-[rgb(var(--theme-500))]" : ' border-r-0 border-y-0 border-l-4 border-transparent'
      )}
    >
      <div className="flex items-center justify-between gap-6 flex-1">
        {/* Left: Chevron, Provider, Time, and Status indicators */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          {/* Chevron */}
          {isOpen ? (
            <ChevronDown className="w-5 h-5 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0" />
          ) : (
            <ChevronRight className="w-5 h-5 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0" />
          )}



          {/* Time Display with Status */}
          <div className="flex items-center gap-2 min-w-0">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div ref={messageRef} className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-help truncate">
                    {timeAgoInSidebar}
                  </div>
                </TooltipTrigger>
                <TooltipContent
                  side="bottom"
                  align="center"
                  className="border border-zinc-800 bg-zinc-900 shadow-xl rounded-lg p-3 animate-in fade-in-0 zoom-in-95"
                >
                  <div className="flex flex-col gap-1.5">
                    <div className="text-xs">
                      Started: {startTime ? convertTimeMiliSecondsToLocalDateTime(startTimeMs, true) : "-"}
                    </div>
                    {finishTime && (
                      <div className="text-xs">
                        Finished: {convertTimeMiliSecondsToLocalDateTime(finishTimeMs, true)}
                      </div>
                    )}
                    <div className="text-xs font-semibold">Duration: {duration}s</div>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Error indicator */}
            {errors && errors.length > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1 cursor-pointer flex-shrink-0">
                      <ExclamationTriangleIcon className="w-4 h-4 text-amber-500" />
                      <span className="text-xs text-amber-500 font-medium">{errors.length}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent
                    side="bottom"
                    align="center"
                    className="border border-zinc-800 bg-zinc-900 shadow-xl rounded-lg p-3 animate-in fade-in-0 zoom-in-95"
                  >
                    <div className="max-w-xs">
                      <p className="font-semibold mb-2">Errors:</p>
                      <ul className="list-disc list-inside space-y-1">
                        {errors.slice(0, 3).map((error, idx) => (
                          <li key={idx} className="text-xs">{error}</li>
                        ))}
                      </ul>
                      {errors.length > 3 && (
                        <p className="text-xs text-zinc-400 mt-2">+{errors.length - 3} more errors</p>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {/* Tools indicator */}
            {run.used_tools && run.used_tools.length > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center text-xs px-1.5 py-0.5 rounded-md border border-border hover:bg-[#252525] transition-colors flex-shrink-0">
                      <span className="text-blue-400 mr-1">🔧</span>
                      <span>{run.used_tools.length}</span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent
                    side="bottom"
                    align="center"
                    className="border border-zinc-800 bg-zinc-900 shadow-xl rounded-lg p-3 animate-in fade-in-0 zoom-in-95"
                  >
                    <div>
                      <p className="font-semibold mb-2">Tools Used:</p>
                      <ul className="space-y-1">
                        {run.used_tools.map((tool, idx) => (
                          <li key={idx} className="text-xs">{tool}</li>
                        ))}
                      </ul>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>

        {/* Right: Stats Grid */}
        <div className="grid items-center gap-4" style={{ gridTemplateColumns: providersInfo && providersInfo.length > 0 ? '50px 70px 100px 50px' : '70px 100px 50px' }}>
          {/* Provider */}
          {providersInfo && providersInfo.length > 0 && (
            <div className="flex flex-col h-full justify-end items-end gap-0.5">
              <ListProviders providersInfo={providersInfo} avatarClass="w-5 h-5" iconClass="w-3 h-3 text-primary" />
            </div>
          )}
          {/* Cost */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex flex-col h-full justify-center items-start gap-0.5 cursor-pointer">
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Cost</span>
                  <span className="text-xs tabular-nums">{formatCost(totalCost)}</span>
                </div>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                align="center"
                className="border border-zinc-800 bg-zinc-900 shadow-xl rounded-lg p-3 animate-in fade-in-0 zoom-in-95"
              >
                <div className="flex flex-col gap-1">
                  <p className="text-[10px] text-zinc-400 uppercase tracking-wider">Total Cost</p>
                  <p className="text-sm tabular-nums">{formatCost(totalCost, 10)}</p>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Tokens */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex flex-col h-full justify-center items-start gap-0.5 cursor-pointer">
                  <span className="text-[9px] text-muted-foreground uppercase tracking-wider">Tokens</span>
                  <div className="flex items-center gap-1">
                    <span className="text-xs tabular-nums">
                      {tokensInfo.inputTokens.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-muted-foreground">/</span>
                    <span className="text-xs tabular-nums">
                      {tokensInfo.outputTokens.toLocaleString()}
                    </span>
                  </div>
                </div>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                align="center"
                className="border border-zinc-800 bg-zinc-900 shadow-xl rounded-lg p-3 animate-in fade-in-0 zoom-in-95"
              >
                <div className="flex flex-col gap-2">
                  <div className="flex flex-col gap-1">
                    <p className="text-[10px] text-zinc-400 uppercase tracking-wider">Input Tokens</p>
                    <p className="text-sm font-semibold tabular-nums">{tokensInfo.inputTokens.toLocaleString()}</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <p className="text-[10px] text-zinc-400 uppercase tracking-wider">Output Tokens</p>
                    <p className="text-sm font-semibold tabular-nums">{tokensInfo.outputTokens.toLocaleString()}</p>
                  </div>
                  <div className="pt-1 border-t border-zinc-800">
                    <div className="flex flex-col gap-1">
                      <p className="text-[10px] text-zinc-400 uppercase tracking-wider">Total Tokens</p>
                      <p className="text-sm font-semibold tabular-nums">{tokensInfo.totalTokens.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Duration */}
          <div className="flex flex-col h-full justify-center items-start gap-0.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Time</span>
            <span className="text-xs tabular-nums">{duration}s</span>
          </div>
        </div>
      </div>
    </Card>
  );
};

// Export memoized component
export const ModelCallSummaryTraces = React.memo(
  SidebarModelCallSummaryTracesImpl
);
