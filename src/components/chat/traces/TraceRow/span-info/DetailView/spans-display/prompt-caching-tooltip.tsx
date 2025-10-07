import { ExternalLink, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatTokenPrice } from "@/utils/format";

interface PromptCachingTooltipProps {
  usageInfo: any;
  costInfo?: any;
  entityByName?: any;
  showLearnMore?: boolean;
}

// Helper function for number formatting
const formatNumber = (num: number) => {
  return new Intl.NumberFormat().format(num);
};

// Helper function to format cost with proper precision
const formatCost = (cost: number) => {
  if (cost === 0) return "$0";
  if (cost < 0.01) return `$${cost.toFixed(6)}`;
  if (cost < 1) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
};
export const getCachedTokens = (usageInfo: any) => {
  let cacheRead = usageInfo?.prompt_tokens_details?.cached_tokens; // cache read tokens
  let cacheWrite = usageInfo?.prompt_tokens_details?.cache_creation_tokens; // cache write tokens,
  let standardTokens = (usageInfo?.input_tokens || usageInfo?.prompt_tokens || 0) - (usageInfo?.prompt_tokens_details?.cached_tokens || 0) - (usageInfo?.prompt_tokens_details?.cache_creation_tokens || 0);
  return {
    read: cacheRead,
    write: cacheWrite,
    standard: standardTokens
  }
}
// Helper function to calculate cache cost
export const calculateCacheCost = (usageInfo: any, modelPriceInfo: any) => {
  const prompt_tokens_details = usageInfo?.prompt_tokens_details;
  if (!prompt_tokens_details) {
    return {
      read_cost: undefined,
      write_cost: undefined,
      standard_cost: undefined
    }
  }
  let cacheTokenInfo = getCachedTokens(usageInfo);
  const standardInputPrice = modelPriceInfo?.price?.per_input_token || 0; // Already price per 1M tokens
  const cachedInputPrice = modelPriceInfo?.price?.per_cached_input_token || 0; // Already price per 1M tokens
  const cacheWritePrice = modelPriceInfo?.price?.per_cached_input_write_token || 0; // Already price per 1M tokens
  let result = {
    read_cost: 0,
    write_cost: 0,
    standard_cost: 0
  }
  if (cacheTokenInfo.write > 0) {
    result.write_cost = (cacheTokenInfo.write / 1000000) * cacheWritePrice;
  }
  if (cacheTokenInfo.read > 0) {
    result.read_cost = (cacheTokenInfo.read / 1000000) * cachedInputPrice;
  }
  if (cacheTokenInfo.standard > 0) {
    result.standard_cost = (cacheTokenInfo.standard / 1000000) * standardInputPrice;
  }
  return result;
};

export const PromptCachingInfo = ({
  usageInfo,
  entityByName,
  showLearnMore = true
}: PromptCachingTooltipProps) => {
  // Determine which cache tokens we have
  const totalInputTokens = usageInfo?.input_tokens || 0;
  const cacheTokens = getCachedTokens(usageInfo);
  const cacheCost = calculateCacheCost(usageInfo, entityByName);

  // Calculate percentages
  const cacheReadPercentage = totalInputTokens > 0 ? ((cacheTokens.read || 0) / totalInputTokens) * 100 : 0;
  const cacheWritePercentage = totalInputTokens > 0 ? ((cacheTokens.write || 0) / totalInputTokens) * 100 : 0;
  const uncachedPercentage = 100 - cacheReadPercentage - cacheWritePercentage;
  // Calculate savings
  const standardInputPricePerMTokens = entityByName?.price?.per_input_token || 0;
  const standardInputPricePerTokens = standardInputPricePerMTokens / 1000000;
  const potentialCost = totalInputTokens > 0 ? (totalInputTokens) * standardInputPricePerTokens : 0;
  const inputNoneCachecost = (totalInputTokens - (cacheTokens.read || 0) - (cacheTokens.write || 0)) * standardInputPricePerTokens;
  const actualInputCost = (cacheCost.read_cost || 0) + (cacheCost.write_cost || 0) + inputNoneCachecost;
  const savings = potentialCost - actualInputCost;
  const savingsPercentage = potentialCost > 0 ? (savings / potentialCost) * 100 : 0;
  const standardInputPrice = entityByName?.price?.per_input_token || 0; // Already price per 1M tokens
  const cachedInputPrice = entityByName?.price?.per_cached_input_token || 0; // Already price per 1M tokens
  const cacheWritePrice = entityByName?.price?.per_cached_input_write_token || 0; // Already price per 1M tokens
  return (
    <div className="flex flex-col gap-2">


      {/* Cache Breakdown - Only for Input Tokens */}
      <div className="space-y-2">

        {/* Enhanced Visual Progress Bar */}
        <div className="space-y-2">
          <div className="relative h-8 bg-muted/30 rounded-lg border border-border overflow-hidden">
            {cacheReadPercentage > 0 && (
              <div
                className="absolute h-full bg-green-500/20  transition-all duration-500 flex items-center justify-center"
                style={{ width: `${cacheReadPercentage}%`, left: 0 }}
              >
                {cacheReadPercentage >= 5 && (
                  <span className="text-xs font-bold text-white drop-shadow-sm">
                    {cacheReadPercentage.toFixed(1)}%
                  </span>
                )}
              </div>
            )}
            {cacheWritePercentage > 0 && (
              <div
                className="absolute h-full bg-amber-500/20 transition-all duration-500 flex items-center justify-center"
                style={{ width: `${cacheWritePercentage}%`, left: `${cacheReadPercentage}%` }}
              >
                {cacheWritePercentage >= 5 && (
                  <span className="text-xs font-bold text-white drop-shadow-sm">
                    {cacheWritePercentage.toFixed(1)}%
                  </span>
                )}
              </div>
            )}
            {uncachedPercentage > 0 && (
              <div
                className="absolute h-full bg-slate-500/20 transition-all duration-500 flex items-center justify-center"
                style={{ width: `${uncachedPercentage}%`, left: `${cacheReadPercentage + cacheWritePercentage}%` }}
              >
                {uncachedPercentage >= 5 && (
                  <span className="text-xs font-bold text-white dark:text-slate-100 drop-shadow-sm">
                    {uncachedPercentage.toFixed(1)}%
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Token Details Cards */}
        <div className="flex gap-2">
          {cacheTokens.read > 0 && (
            <div className="bg-green-500/10 flex-1 dark:bg-green-500/20 rounded-lg p-3 border border-green-500/20">
              <div className="flex flex-col justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-xs font-medium text-green-700 dark:text-green-400">Cache Read</span>
                </div>
                <span className="text-xs font-bold text-green-700 dark:text-green-400">
                  {cacheReadPercentage.toFixed(1)}%
                </span>
              </div>
              <p className="text-xs font-mono font-bold text-green-700 dark:text-green-300">
                {formatNumber(cacheTokens.read)} tokens
              </p>
              <p className="text-xs font-medium text-green-700 dark:text-green-400">
                Price: {formatTokenPrice(cachedInputPrice)}
              </p>
              {cacheCost.read_cost && <p className="text-xs font-medium text-green-700 dark:text-green-400">
                Cost: ~{formatCost(cacheCost.read_cost)}
              </p>}
            </div>
          )}
          {cacheTokens.write > 0 && (
            <div className="bg-amber-500/10 flex-1 dark:bg-amber-500/20 rounded-lg p-3 border border-amber-500/20">
              <div className="flex flex-col  justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 bg-amber-500 rounded-full" />
                  <span className="text-xs font-medium text-amber-700 dark:text-amber-400">Cache Write</span>
                </div>
                <span className="text-xs font-bold text-amber-700 dark:text-amber-400">
                  {cacheWritePercentage.toFixed(1)}%
                </span>
              </div>
              <p className="text-xs font-mono font-bold text-amber-700 dark:text-amber-300">
                {formatNumber(cacheTokens.write)} tokens
              </p>
              <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                Price: {formatTokenPrice(cacheWritePrice)}
              </p>
              {cacheCost.write_cost && <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                Cost: ~{formatCost(cacheCost.write_cost)}
              </p>}
            </div>
          )}
          <div className="bg-muted/50 flex-1 rounded-lg p-3 border border-border">
            <div className="flex flex-col justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 bg-slate-400 dark:bg-slate-600 rounded-full" />
                <span className="text-xs font-medium text-muted-foreground">Standard</span>
              </div>
              <span className="text-xs font-bold text-muted-foreground">
                {uncachedPercentage.toFixed(1)}%
              </span>
            </div>
            <p className="text-xs font-mono font-bold">
              {formatNumber(totalInputTokens - (cacheTokens.read || 0) - (cacheTokens.write || 0))} tokens
            </p>
            <p className="text-xs font-medium text-muted-foreground">
              Price: {formatTokenPrice(standardInputPrice)}
            </p>
            {cacheCost.standard_cost && <p className="text-xs font-medium text-muted-foreground">
              Cost: ~{formatCost(cacheCost.standard_cost)}
            </p>}
          </div>
        </div>
      </div>


      {/* Cache cost breakdown */}
      {savings !== 0 && (
        <div className={cn("relative overflow-hidden  rounded-lg p-4 border", savings > 0 ? "border-green-500/20" : "border-amber-500/20")}>
          <div className={cn("absolute top-0 righ t-0 w-24 h-24 rounded-full blur-2xl", savings > 0 ? "bg-green-500/10" : "bg-amber-500/10")} />
          <div className="relative space-y-3">
            <div className="flex items-center gap-2">
              <div className={cn("p-1.5 rounded-md", savings > 0 ? "bg-green-500/20" : "bg-amber-500/20")}>
                {savings > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              </div>
              <span className={cn("text-xs font-semibold", savings > 0 ? "text-green-700 dark:text-green-400" : "text-amber-700 dark:text-amber-400")}>{savings > 0 ? "Cache Savings" : "Cache Cost"}</span>
            </div>


            <div className="flex gap-1">
              <div className="flex-1">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <div className="flex items-center gap-1 mb-0.5">
                        <p className="text-[10px] text-muted-foreground">Without cache</p>
                      </div>
                      <p className="text-xs font-mono font-bold text-amber-700 dark:text-amber-300">
                        ~{formatCost(potentialCost)}
                      </p>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="space-y-2 text-xs">
                        <p className="font-medium">Standard cost calculation:</p>
                        <div className="space-y-1">
                          <div className="flex justify-between gap-1">
                            <span>Input tokens:</span>
                            <span className="font-mono">{formatNumber(totalInputTokens)}</span>
                          </div>
                          <div className="flex justify-between gap-1">
                            <span>Standard price:</span>
                            <span className="font-mono">{formatTokenPrice(standardInputPrice)}</span>
                          </div>
                          <div className="border-t border-border pt-1 flex justify-between gap-1 font-medium">
                            <span>Formula:</span>
                            <span className="font-mono">Tokens × Price</span>
                          </div>
                          <div className="flex justify-between gap-1 font-medium">
                            <span>Result:</span>
                            <span className="font-mono">{formatCost(potentialCost)}</span>
                          </div>
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              <div className="flex-1">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>

                      <div className="flex items-center gap-1 mb-0.5">

                        <p className="text-[10px] text-muted-foreground">With cache</p>

                      </div>
                      <p className={cn("text-xs font-mono font-bold", savings > 0 ? "text-green-700 dark:text-green-300" : "text-amber-700 dark:text-amber-300")}>
                        ~{formatCost(actualInputCost)}
                      </p>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="space-y-2 text-xs">
                        <p className="font-medium">Calculation breakdown:</p>
                        <div className="space-y-1">
                          {cacheTokens.read > 0 && (
                            <div className="flex justify-between gap-1">
                              <span className="text-green-600">Cache Read:</span>
                              <span className="font-mono">
                                {formatNumber(cacheTokens.read)} × {formatTokenPrice(cachedInputPrice)} = {formatCost(cacheCost.read_cost || 0)}
                              </span>
                            </div>
                          )}
                          {cacheTokens.write > 0 && (
                            <div className="flex justify-between gap-1">
                              <span className="text-amber-600">Cache Write:</span>
                              <span className="font-mono">
                                {formatNumber(cacheTokens.write)} × {formatTokenPrice(cacheWritePrice)} = {formatCost(cacheCost.write_cost || 0)}
                              </span>
                            </div>
                          )}
                          {cacheTokens.standard > 0 && (
                            <div className="flex justify-between gap-1">
                              <span className="">Standard:</span>
                              <span className="font-mono">
                                {formatNumber(cacheTokens.standard)} × {formatTokenPrice(standardInputPrice)} = {formatCost(cacheCost.standard_cost || 0)}
                              </span>
                            </div>
                          )}
                          <div className="border-t border-border pt-1 flex justify-between font-medium">
                            <span>Total:</span>
                            <span className="font-mono">{formatCost(actualInputCost)}</span>
                          </div>
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              <div className="flex-1">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <div className="flex items-center gap-1 mb-0.5">
                        <p className="text-[10px] text-muted-foreground">{savings > 0 ? "Amount Saved" : "Amount Increased"}</p>
                      </div>
                      <p className={cn("text-xs font-mono font-bold", savings > 0 ? "text-green-700 dark:text-green-300" : "text-amber-700 dark:text-amber-300")}>
                        ~{formatCost(Math.abs(savings))}
                      </p>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="space-y-2 text-xs">
                        <p className="font-medium">Savings calculation:</p>
                        <div className="space-y-1">
                          <div className="flex justify-between gap-1">
                            <span className="text-amber-600">Standard cost:</span>
                            <span className="font-mono">{formatCost(potentialCost)}</span>
                          </div>
                          <div className="flex justify-between gap-1">
                            <span className="text-green-600">Actual cost:</span>
                            <span className="font-mono">{formatCost(actualInputCost)}</span>
                          </div>
                          <div className="border-t border-border pt-1 flex justify-between font-medium">
                            <span>{savings > 0 ? "Savings:" : "Increase:"}</span>
                            <span className="font-mono">{formatCost(Math.abs(savings))}</span>
                          </div>
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <div className="flex items-center gap-1 mb-0.5">
                        <p className="text-[10px] text-muted-foreground">{savings > 0 ? "Savings %" : "Cost Increase %"}</p>
                      </div>
                      <p className={cn("text-xs font-mono font-bold", savings > 0 ? "text-green-700 dark:text-green-300" : "text-amber-700 dark:text-amber-300")}>
                        {Math.abs(savingsPercentage).toFixed(1)}%
                      </p>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="space-y-2 text-xs">
                        <p className="font-medium">Percentage calculation:</p>
                        <div className="space-y-1">
                          <div className="flex justify-between">
                            <span className="text-amber-600">Standard cost:</span>
                            <span className="font-mono">{formatCost(potentialCost)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-green-600">{savings > 0 ? "Savings:" : "Increase:"}</span>
                            <span className="font-mono">{formatCost(savings)}</span>
                          </div>
                          <div className="border-t border-border pt-1 flex justify-between font-medium">
                            <span>Formula:</span>
                            <span className="font-mono">(Savings ÷ Standard) × 100</span>
                          </div>
                          <div className="flex justify-between font-medium">
                            <span>Result:</span>
                            <span className="font-mono">{savingsPercentage.toFixed(1)}%</span>
                          </div>
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          </div>
        </div>
      )}

      {showLearnMore && (
        <a
          href="https://docs.langdb.ai/features/prompt-caching"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs flex items-center gap-1 text-blue-400 hover:text-blue-300 transition-colors mt-2"
        >
          Learn more about prompt caching
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
    </div>
  );
};

