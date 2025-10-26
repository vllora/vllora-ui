import React, { useMemo } from 'react';
import { Upload, Download, Database } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ModelPricing } from '@/types/models';

interface CostDisplayProps {
  model: ModelPricing;
  className?: string;
  showTooltip?: boolean;
}

const formatMoney = (money?: number, precision: number = 3) => {
  if (!money) return "$0";
  if (money === 0) return "$0";
  if (money < Math.pow(10, -precision)) return `<$${Math.pow(10, -precision)}`;
  return `$${parseFloat(money.toFixed(precision))}`;
};

const formatTokenPrice = (price?: number, type?: string, moneyOnly?: boolean) => {
  if (type === "image generation" || type === 'image_generation') {
    return price ? `${formatMoney(price, 2)} / image` : "";
  }
  return price ? `${formatMoney(price, 2)}${moneyOnly ? "" : " / 1M tokens"}` : "_";
};

export const CostDisplay: React.FC<CostDisplayProps> = ({
  model,
  className = "",
  showTooltip = true
}) => {
  // Get ALL endpoints (show pricing for both configured and unconfigured providers)
  const allEndpoints = model.endpoints || [];
  
  const inputCostRange = useMemo(() => {
    // If model has endpoints, calculate range from all endpoints
    if (allEndpoints.length > 0) {
      const inputCosts = allEndpoints
        .filter((endpoint: any) => endpoint.pricing?.per_input_token !== undefined)
        .map((endpoint: any) => endpoint.pricing?.per_input_token || 0)
        .sort((a: number, b: number) => a - b);
      
      if (inputCosts.length === 0) {
        // Fall back to model price if endpoints don't have pricing
        const cost = model.price?.per_input_token;
        return cost !== undefined ? { min: cost, max: cost } : undefined;
      }
      if (inputCosts.length === 1) return { min: inputCosts[0], max: inputCosts[0] };
      
      return { min: inputCosts[0], max: inputCosts[inputCosts.length - 1] };
    }
    // Fallback to model's direct price when no endpoints
    const cost = model.price?.per_input_token;
    return cost !== undefined ? { min: cost, max: cost } : undefined;
  }, [allEndpoints, model]);

  const outputCostRange = useMemo(() => {
    // If model has endpoints, calculate range from all endpoints
    if (allEndpoints.length > 0) {
      const outputCosts = allEndpoints
        .filter((endpoint: any) => endpoint.pricing?.per_output_token !== undefined)
        .map((endpoint: any) => endpoint.pricing?.per_output_token || 0)
        .sort((a: number, b: number) => a - b);
      
      if (outputCosts.length === 0) {
        // Fall back to model price if endpoints don't have pricing
        const cost = model.price?.per_output_token;
        return cost !== undefined ? { min: cost, max: cost } : undefined;
      }
      if (outputCosts.length === 1) return { min: outputCosts[0], max: outputCosts[0] };
      
      return { min: outputCosts[0], max: outputCosts[outputCosts.length - 1] };
    }
    // Fallback to model's direct price when no endpoints
    const cost = model.price?.per_output_token;
    return cost !== undefined ? { min: cost, max: cost } : undefined;
  }, [allEndpoints, model]);

  const cachingEnabled = useMemo(() => {
    // Check if any endpoint supports caching
    if (allEndpoints.length > 0) {
      return allEndpoints.some((endpoint: any) => 
        endpoint.pricing?.per_cached_input_token || endpoint.pricing?.per_cached_input_write_token
      );
    }
    // Fallback to model's direct price for backward compatibility
    return model.price?.per_cached_input_token || model.price?.per_cached_input_write_token;
  }, [allEndpoints, model]);

  const formatCostRange = (range: { min: number; max: number } | undefined) => {
    if (!range) return '';
    if (range.min === 0 && range.max === 0) return 'Free';
    if (range.min === range.max) {
      return formatTokenPrice(range.min, model.type).replace(' / 1M tokens', '');
    }
    const minStr = formatTokenPrice(range.min, model.type).replace(' / 1M tokens', '');
    const maxStr = formatTokenPrice(range.max, model.type).replace(' / 1M tokens', '');
    return `${minStr} - ${maxStr}`;
  };

  const content = (
    <div className={`flex items-center gap-2 ${showTooltip ? 'cursor-help' : ''} ${className}`}>
      {inputCostRange !== undefined && (
        <div className="flex items-center gap-1">
          <Upload className="w-3 h-3 text-zinc-400" />
          <span className="text-xs text-zinc-300">
            {formatCostRange(inputCostRange)}
          </span>
        </div>
      )}
      {outputCostRange !== undefined && (
        <div className="flex items-center gap-1">
          <Download className="w-3 h-3 text-zinc-400" />
          <span className="text-xs text-zinc-300">
            {formatCostRange(outputCostRange)}
          </span>
        </div>
      )}
      {cachingEnabled && (
        <Database className="w-3 h-3 text-[rgb(var(--theme-500))]" />
      )}
    </div>
  );

  if (!showTooltip) return content;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          {content}
        </TooltipTrigger>
        <TooltipContent side="top" className="bg-zinc-800 border-zinc-700 text-white max-w-md">
          <div className="space-y-2">
            <p className="text-xs font-medium border-b border-zinc-700 pb-1">Pricing per 1M tokens</p>
            {allEndpoints.length > 1 ? (
              <div className="min-w-[300px]">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-700">
                      <th className="text-left text-zinc-400 font-medium pb-1 pr-3">Provider</th>
                      <th className="text-right text-zinc-400 font-medium pb-1 px-2">Input</th>
                      <th className="text-right text-zinc-400 font-medium pb-1 px-2">Output</th>
                      {allEndpoints.some((e: any) => e.pricing?.per_cached_input_token || e.pricing?.per_cached_input_write_token) && (
                        <>
                          <th className="text-right text-zinc-400 font-medium pb-1 px-2">Cached</th>
                          {allEndpoints.some((e: any) => e.pricing?.per_cached_input_write_token) && (
                            <th className="text-right text-zinc-400 font-medium pb-1 pl-2">Write</th>
                          )}
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-700/50">
                    {allEndpoints
                      .filter((e: any) => e.pricing?.per_input_token !== undefined || e.pricing?.per_output_token !== undefined)
                      .map((endpoint: any, idx: number) => (  
                        <tr key={idx}>
                          <td className="py-1 text-zinc-300 pr-3">{endpoint.provider.provider}</td>
                          <td className="py-1 text-right text-zinc-200 px-2">
                            {endpoint.pricing?.per_input_token === 0 ? 'Free' :
                             endpoint.pricing?.per_input_token !== undefined ? formatTokenPrice(endpoint.pricing.per_input_token, model.type).replace(' / 1M tokens', '') : '-'}
                          </td>
                          <td className="py-1 text-right text-zinc-200 px-2">
                            {endpoint.pricing?.per_output_token === 0 ? 'Free' :
                             endpoint.pricing?.per_output_token !== undefined ? formatTokenPrice(endpoint.pricing.per_output_token, model.type).replace(' / 1M tokens', '') : '-'}
                          </td>
                          {allEndpoints.some((e: any) => e.pricing?.per_cached_input_token || e.pricing?.per_cached_input_write_token) && (
                            <>
                              <td className="py-1 text-right text-zinc-200 px-2">
                                {endpoint.pricing?.per_cached_input_token === 0 ? 'Free' :
                                 endpoint.pricing?.per_cached_input_token !== undefined ? formatTokenPrice(endpoint.pricing.per_cached_input_token, model.type).replace(' / 1M tokens', '') : '-'}
                              </td>
                              {allEndpoints.some((e: any) => e.pricing?.per_cached_input_write_token) && (
                                <td className="py-1 text-right text-zinc-200 pl-2">
                                  {endpoint.pricing?.per_cached_input_write_token === 0 ? 'Free' :
                                   endpoint.pricing?.per_cached_input_write_token !== undefined ? formatTokenPrice(endpoint.pricing.per_cached_input_write_token, model.type).replace(' / 1M tokens', '') : '-'}
                                </td>
                              )}
                            </>
                          )}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="space-y-1">
                {inputCostRange !== undefined && (
                  <div className="flex justify-between gap-4 text-xs">
                    <span className="text-zinc-400">Input:</span>
                    <span className="text-zinc-200">{formatCostRange(inputCostRange)}</span>
                  </div>
                )}
                {outputCostRange !== undefined && (
                  <div className="flex justify-between gap-4 text-xs">
                    <span className="text-zinc-400">Output:</span>
                    <span className="text-zinc-200">{formatCostRange(outputCostRange)}</span>
                  </div>
                )}
                {model.price?.per_cached_input_token && (
                  <div className="flex justify-between gap-4 text-xs">
                    <span className="text-zinc-400">Cached:</span>
                    <span className="text-zinc-200">{formatTokenPrice(model.price?.per_cached_input_token, model.type).replace(' / 1M tokens', '')}</span>
                  </div>
                )}
                {model.price?.per_cached_input_write_token && (
                  <div className="flex justify-between gap-4 text-xs">
                    <span className="text-zinc-400">Cache Write:</span>
                    <span className="text-zinc-200">{formatTokenPrice(model.price?.per_cached_input_write_token, model.type).replace(' / 1M tokens', '')}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
