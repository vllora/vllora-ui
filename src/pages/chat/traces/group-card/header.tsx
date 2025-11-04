import React from "react";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatCost } from "@/utils/formatCost";
import { ListProviders } from "@/components/chat/thread/ListProviders";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Grid layout for card stats - matches across all cards for alignment
const CARD_STATS_GRID = '90px 70px 110px';

interface GroupCardHeaderProps {
  isOpen: boolean;
  titleDisplay: React.ReactNode;
  providersInfo: { provider: string; models: string[] }[];
  totalCost: number;
  tokensInfo: {
    inputTokens: number;
    outputTokens: number;
  };
  errors: string[];
  llm_calls: number;
}

export const GroupCardHeader: React.FC<GroupCardHeaderProps> = ({
  isOpen,
  titleDisplay,
  providersInfo,
  totalCost,
  tokensInfo,
  errors,
  llm_calls,
}) => {
  return (
    <div className="flex items-center justify-between gap-6">
      {/* Left: Expand button and Time info */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {isOpen ? (
          <ChevronDown className="w-5 h-5 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0" />
        ) : (
          <ChevronRight className="w-5 h-5 text-muted-foreground hover:text-foreground transition-colors flex-shrink-0" />
        )}
        <div className="flex items-center gap-3 min-w-0">
          <div className="text-sm font-semibold text-primary truncate">
            {titleDisplay}
          </div>
          {providersInfo && providersInfo.length > 0 && (
            <ListProviders providersInfo={providersInfo} avatarClass="w-6 h-6" iconClass="w-3 h-3 text-primary" />
          )}
          {errors && errors.length > 0 ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 cursor-pointer">
                    <ExclamationTriangleIcon className="w-4 h-4 text-amber-500" />
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <div className="max-w-xs">
                    <p className="font-semibold mb-1">Errors:</p>
                    <ul className="list-disc list-inside space-y-1">
                      {errors.map((error, index) => (
                        <li key={index} className="text-xs">{error}</li>
                      ))}
                    </ul>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <></>
          )}
        </div>
      </div>

      {/* Right: Stats and Errors */}
      <div className="grid items-center gap-4" style={{ gridTemplateColumns: CARD_STATS_GRID }}>
        <div className="flex flex-1 flex-col h-full justify-center items-end gap-0.5 cursor-pointer">
          <span className="text-[10px] text-muted-foreground uppercase ">Model Calls</span>
          <span className="text-xs font-semibold tabular-nums">{llm_calls}</span>
        </div>

        {/* Cost */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex flex-col h-full justify-center items-end gap-0.5 cursor-pointer">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Cost</span>
                <span className="text-xs font-semibold tabular-nums">{formatCost(totalCost)}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              align="center"
              className="border border-zinc-800 bg-zinc-900 shadow-xl rounded-lg p-3 animate-in fade-in-0 zoom-in-95"
            >
              <div className="flex flex-col gap-1">
                <p className="text-[10px] text-zinc-400 uppercase tracking-wider">Total Cost</p>
                <p className="text-sm font-semibold tabular-nums">{formatCost(totalCost, 10)}</p>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Tokens */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex flex-col h-full justify-center items-end gap-0.5 cursor-pointer">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Tokens</span>
                <div className="flex items-center gap-1">
                  <span className="text-xs font-semibold tabular-nums">
                    {tokensInfo.inputTokens.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-muted-foreground">/</span>
                  <span className="text-xs font-semibold tabular-nums">
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
                    <p className="text-sm font-semibold tabular-nums">{((tokensInfo.inputTokens + tokensInfo.outputTokens)).toLocaleString()}</p>
                  </div>
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>


      </div>
    </div>
  );
};
