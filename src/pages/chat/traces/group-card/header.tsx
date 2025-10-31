import React from "react";
import { ExclamationTriangleIcon, CheckCircleIcon } from "@heroicons/react/24/outline";
import { ChevronDown, ChevronRight, CircleDollarSignIcon, CurrencyIcon, DollarSignIcon, Download, Upload } from "lucide-react";
import { formatCost } from "@/utils/formatCost";
import { ListProviders } from "@/components/chat/thread/ListProviders";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Grid layout for card stats - matches across all cards for alignment
const CARD_STATS_GRID = '80px 150px';

interface GroupCardHeaderProps {
  isOpen: boolean;
  bucketTimeDisplay: string;
  providersInfo: { provider: string; models: string[] }[];
  totalCost: number;
  tokensInfo: {
    inputTokens: number;
    outputTokens: number;
  };
  errors: string[];
}

export const GroupCardHeader: React.FC<GroupCardHeaderProps> = ({
  isOpen,
  bucketTimeDisplay,
  providersInfo,
  totalCost,
  tokensInfo,
  errors,
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
          <h3 className="text-sm font-semibold text-primary truncate" title={bucketTimeDisplay}>
            {bucketTimeDisplay}
          </h3>
           {providersInfo && providersInfo.length > 0 && (
            <ListProviders providersInfo={providersInfo} avatarClass="w-6 h-6" iconClass="w-3 h-3 text-primary" />
          )}
          {errors && errors.length > 0 ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 cursor-pointer">
                    <ExclamationTriangleIcon className="w-4 h-4 text-amber-500" />
                    <span className="text-xs text-amber-500 font-medium">{errors.length}</span>
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
            <CheckCircleIcon className="w-4 h-4 text-green-500" />
          )}
        </div>
      </div>

      {/* Right: Stats and Errors */}
      <div className="grid items-center gap-4" style={{ gridTemplateColumns: CARD_STATS_GRID }}>
       
        {/* Cost */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex flex-row h-full justify-center items-center gap-2 cursor-pointer">
                <CircleDollarSignIcon className="w-3.5 h-3.5" />
                <span className="text-xs font-semibold tabular-nums">{formatCost(totalCost)}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              align="center"
              className="border border-zinc-800 bg-zinc-900 shadow-xl rounded-lg p-3 animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
            >
              <div className="flex flex-col gap-1">
                <p className="text-[10px] text-zinc-400 uppercase tracking-wider">Total Cost</p>
                <p className="text-sm font-semibold tabular-nums">{formatCost(totalCost, 20)}</p>
              </div>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* Tokens */}
        <div className="flex flex-col h-full justify-center items-center gap-0.5">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Upload className="w-3.5 h-3.5" />
              <span className="text-xs font-semibold tabular-nums">
                {tokensInfo.inputTokens.toLocaleString()}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Download className="w-3.5 h-3.5" />
              <span className="text-xs font-semibold tabular-nums">
                {tokensInfo.outputTokens.toLocaleString()}
              </span>
            </div>
          </div>
        </div>


      </div>
    </div>
  );
};
