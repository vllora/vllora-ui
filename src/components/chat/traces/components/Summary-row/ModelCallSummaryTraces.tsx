import React, { useCallback } from "react";
import { RunDTO } from "@/types/common-type";
import { Card } from "@/components/ui/card";
import {
  ExclamationTriangleIcon,
  ClockIcon,
  CurrencyDollarIcon,
} from "@heroicons/react/24/outline";
import { ChevronRight, Download, Upload, X } from "lucide-react";
import { formatDistanceToNow, differenceInMinutes } from "date-fns";
import {
  Tooltip,
  TooltipProvider,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { ProviderIcon } from "@/components/Icons/ProviderIcons";
import { formatCost } from "@/utils/formatCost";
import { ChatWindowConsumer } from "@/contexts/ChatWindowContext";
import { formatMessageTime } from "@/utils/dateUtils";

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
  const { hoveredRunId } = ChatWindowConsumer();
  const runId = run.run_id || "";
  const isHovered = hoveredRunId === runId;

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

  // Extract provider names from models (e.g., "openai/gpt-4" -> "openai")
  const getProviderName = (modelName: string) => {
    const parts = modelName.split('/');
    return parts.length > 1 ? parts[0] : 'default';
  };

  const providers = Array.from(new Set(modelNamesInvoked.map(getProviderName)));

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

  const duration = finishTime && startTime ? getDurations(startTimeMs, finishTimeMs) : "0.00";

  const handleCardClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onChevronClick?.();
    },
    [onChevronClick]
  );

  // Improved time display with better granularity for older traces
  const getTimeDisplay = () => {
    if (!startTime) return "";
    const traceDate = new Date(startTime / 1000);
    const dateString = traceDate.toISOString();
    return formatMessageTime(dateString);
  };

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
        "py-2 hover:bg-[#171717] bg-[#161616] transition-all gap-1 flex px-2 cursor-pointer",
        isOpen && "bg-[#171717]",
        isHovered && !isOpen ? " border-r-0 border-y-0 border-l-4 border-[rgb(var(--theme-500))]" : ' border-r-0 border-y-0 border-l-4 border-transparent'

      )}
    >
      <div className="flex flex-col gap-2 flex-1">
        {/* Top row with chevron, providers, span count, and run ID */}
        <div className="flex items-center">
          {/* Provider Icons */}
          <div className="mr-2 flex">
            {providers.length > 0 && (
              <ProviderIcon
                provider_name={providers[0]}
                className="h-5 w-5 rounded-full"
              />
            )}
            {providers.length > 1 && (
              <span className="ml-1 text-xs text-muted-foreground">
                +{providers.length - 1}
              </span>
            )}
          </div>

          {/* Error indicator */}
          {errors && errors.length > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center text-xs text-yellow-500 hover:text-yellow-400 transition-colors hover:cursor-help mr-2">
                    <ExclamationTriangleIcon className="w-3.5 h-3.5 text-yellow-500 mr-1" />
                    <span className="text-yellow-500">{errors.length}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <div className="space-y-1">
                    {errors.slice(0, 3).map((error, idx) => (
                      <div key={idx} className="text-xs break-words">
                        {error}
                      </div>
                    ))}
                    {errors.length > 3 && (
                      <div className="text-xs text-muted-foreground">
                        +{errors.length - 3} more errors
                      </div>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* Time info */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="flex items-center text-xs text-muted-foreground hover:text-foreground transition-colors hover:cursor-help truncate">
                  <ClockIcon className="w-3.5 h-3.5 mr-1.5 text-blue-400" />
                  <span className={cn("font-mono", errors && errors.length > 0 ? "max-w-[130px] truncate" : "max-w-[150px] truncate")}>
                    {timeAgoInSidebar}
                  </span>
                </div>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs p-1.5">
                <div className="flex flex-col gap-1">
                  <div>
                    Started:{" "}
                    {startTime
                      ? convertTimeMiliSecondsToLocalDateTime(startTimeMs, true)
                      : "-"}
                  </div>
                  {finishTime && (
                    <div>
                      Finished:{" "}
                      {convertTimeMiliSecondsToLocalDateTime(finishTimeMs, true)}
                    </div>
                  )}
                  <div className="font-semibold">Duration: {duration}s</div>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {/* Tools info */}
          {run.used_tools && run.used_tools.length > 0 && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center text-xs px-1.5 py-0.5 rounded-md border border-border hover:bg-[#252525] transition-colors ml-2">
                    <span className="text-blue-400 mr-1">🔧</span>
                    <span>{run.used_tools.length}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <div className="space-y-1">
                    <div className="font-semibold">Tools Used:</div>
                    {run.used_tools.map((tool, idx) => (
                      <div key={idx} className="text-xs">
                        {tool}
                      </div>
                    ))}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}

          {/* Run ID - Right aligned */}
          <div className="ml-auto flex gap-2">
            <div className="text-xs font-mono text-muted-foreground">
              {runId.slice(0, 8)}...
            </div>
          </div>
        </div>

        {/* Bottom row with metrics */}
        <div className="flex justify-between text-xs">
          {/* Cost */}
          <div className="flex items-center">
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-teal-500/10 mr-2">
              <CurrencyDollarIcon className="w-3.5 h-3.5 text-teal-500" />
            </div>
            <div>
              <div className="font-semibold text-[10px]">Cost</div>
              <div className="tabular-nums text-white font-medium">
                {formatCost(totalCost)}
              </div>
            </div>
          </div>

          {/* Input Tokens */}
          <div className="flex items-center">
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-500/10 mr-2">
              <Upload className="w-3.5 h-3.5 text-blue-500" />
            </div>
            <div>
              <div className="font-semibold text-[10px]">Input</div>
              <div className="tabular-nums text-white font-medium">
                {tokensInfo.inputTokens.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Output Tokens */}
          <div className="flex items-center">
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-purple-500/10 mr-2">
              <Download className="w-3.5 h-3.5 text-purple-500" />
            </div>
            <div>
              <div className="font-semibold text-[10px]">Output</div>
              <div className="tabular-nums text-white font-medium">
                {tokensInfo.outputTokens.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Duration */}
          <div className="flex items-center">
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/10 mr-2">
              <ClockIcon className="w-3.5 h-3.5 text-amber-500" />
            </div>
            <div>
              <div className="font-semibold text-[10px]">Duration</div>
              <div className="tabular-nums text-white font-medium">
                {duration}s
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Chevron */}
      <div className="flex items-center self-center">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-8 w-8 !p-1">
                {isOpen ? (
                  <X
                    className="w-4 h-4 text-text transition-all duration-200 hover:text-white"
                    aria-hidden="true"
                  />
                ) : (
                  <ChevronRight
                    className={`w-4 h-4 text-text transition-transform duration-200 ${
                      isOpen ? "rotate-90" : ""
                    }`}
                    aria-hidden="true"
                  />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {isOpen ? "Hide details" : "Expand to view more details"}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </Card>
  );
};

// Export memoized component
export const ModelCallSummaryTraces = React.memo(
  SidebarModelCallSummaryTracesImpl
);
