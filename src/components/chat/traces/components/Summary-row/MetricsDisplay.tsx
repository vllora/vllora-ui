import React from "react";
import {
  Tooltip,
  TooltipProvider,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatCost } from "@/utils/formatCost";
import { AnimatedNumber } from "./AnimatedNumber";

interface TokensInfo {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

interface MetricsDisplayProps {
  totalCost: number;
  tokensInfo: TokensInfo;
  duration: string;
  className?: string;
}

export const MetricsDisplay: React.FC<MetricsDisplayProps> = ({
  totalCost,
  tokensInfo,
  duration,
  className = "",
}) => {
  return (
    <div className={`flex justify-between items-center flex-1 ${className}`}>
      {/* Cost */}
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex flex-col h-full justify-center items-start gap-0.5 cursor-pointer">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Cost</span>
              <AnimatedNumber
                value={totalCost}
                formatter={(v) => formatCost(v)}
                className="text-xs tabular-nums"
              />
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
                <AnimatedNumber
                  value={tokensInfo.inputTokens}
                  className="text-xs tabular-nums"
                />
                <span className="text-[10px] text-muted-foreground">/</span>
                <AnimatedNumber
                  value={tokensInfo.outputTokens}
                  className="text-xs tabular-nums"
                />
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
  );
};
