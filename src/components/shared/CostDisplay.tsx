import React, { useMemo } from 'react';
import { Upload, Download, Database } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ModelPricing } from '@/types/models';

interface CostDisplayProps {
  model: ModelPricing;
  modelsGroup?: ModelPricing[];
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
  modelsGroup,
  className = "",
  showTooltip = true
}) => {
  const inputCost = useMemo(() => {
    if (modelsGroup && modelsGroup.length > 1) {
      const modelWithTotalCost = modelsGroup
        .filter(m => m.price?.per_input_token !== undefined && m.price?.per_output_token !== undefined)
        .map(m => {
          let inputcost = m.price?.per_input_token || 0;
          let outputcost = m.price?.per_output_token || 0;
          return { total: inputcost + outputcost, model: m }
        })
        .sort((a, b) => a.total - b.total);
      return modelWithTotalCost.length > 0 ? modelWithTotalCost[0].model.price?.per_input_token : undefined;
    }
    return model.price?.per_input_token;
  }, [modelsGroup, model]);

  const outputCost = useMemo(() => {
    if (modelsGroup && modelsGroup.length > 1) {
      const modelWithTotalCost = modelsGroup
        .filter(m => m.price?.per_input_token !== undefined && m.price?.per_output_token !== undefined)
        .map(m => {
          let inputcost = m.price?.per_input_token || 0;
          let outputcost = m.price?.per_output_token || 0;
          return { total: inputcost + outputcost, model: m }
        })
        .sort((a, b) => a.total - b.total);
      return modelWithTotalCost.length > 0 ? modelWithTotalCost[0].model.price?.per_output_token : undefined;
    }
    return model.price?.per_output_token;
  }, [modelsGroup, model]);

  const cachingEnabled = useMemo(() => {
    if (modelsGroup && modelsGroup.length > 1) {
      return modelsGroup.some(m => m.price?.per_cached_input_token || m.price?.per_cached_input_write_token);
    }
    return model.price?.per_cached_input_token || model.price?.per_cached_input_write_token;
  }, [modelsGroup, model]);

  const content = (
    <div className={`flex items-center gap-2 ${showTooltip ? 'cursor-help' : ''} ${className}`}>
      {inputCost !== undefined && (
        <div className="flex items-center gap-1">
          <Upload className="w-3 h-3 text-zinc-400" />
          <span className="text-xs text-zinc-300">
            {inputCost === 0 ? 'Free' : formatTokenPrice(inputCost, model.type).replace(' / 1M tokens', '')}
          </span>
        </div>
      )}
      {outputCost !== undefined && (
        <div className="flex items-center gap-1">
          <Download className="w-3 h-3 text-zinc-400" />
          <span className="text-xs text-zinc-300">
            {outputCost === 0 ? 'Free' : formatTokenPrice(outputCost, model.type).replace(' / 1M tokens', '')}
          </span>
        </div>
      )}
      {cachingEnabled && (
        <Database className="w-3 h-3 text-theme-500" />
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
            {modelsGroup && modelsGroup.length > 1 ? (
              <div className="min-w-[300px]">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-700">
                      <th className="text-left text-zinc-400 font-medium pb-1 pr-3">Provider</th>
                      <th className="text-right text-zinc-400 font-medium pb-1 px-2">Input</th>
                      <th className="text-right text-zinc-400 font-medium pb-1 px-2">Output</th>
                      {modelsGroup.some(m => m.price?.per_cached_input_token || m.price?.per_cached_input_write_token) && (
                        <>
                          <th className="text-right text-zinc-400 font-medium pb-1 px-2">Cached</th>
                          {modelsGroup.some(m => m.price?.per_cached_input_write_token) && (
                            <th className="text-right text-zinc-400 font-medium pb-1 pl-2">Write</th>
                          )}
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-700/50">
                    {modelsGroup
                      .filter(m => m.price?.per_input_token !== undefined || m.price?.per_output_token !== undefined)
                      .map((m, idx) => (
                        <tr key={idx}>
                          <td className="py-1 text-zinc-300 pr-3">{m.inference_provider.provider}</td>
                          <td className="py-1 text-right text-zinc-200 px-2">
                            {m.price?.per_input_token === 0 ? 'Free' :
                             m.price?.per_input_token !== undefined ? formatTokenPrice(m.price.per_input_token, m.type).replace(' / 1M tokens', '') : '-'}
                          </td>
                          <td className="py-1 text-right text-zinc-200 px-2">
                            {m.price?.per_output_token === 0 ? 'Free' :
                             m.price?.per_output_token !== undefined ? formatTokenPrice(m.price.per_output_token, m.type).replace(' / 1M tokens', '') : '-'}
                          </td>
                          {modelsGroup.some(model => model.price?.per_cached_input_token || model.price?.per_cached_input_write_token) && (
                            <>
                              <td className="py-1 text-right text-zinc-200 px-2">
                                {m.price?.per_cached_input_token === 0 ? 'Free' :
                                 m.price?.per_cached_input_token !== undefined ? formatTokenPrice(m.price.per_cached_input_token, m.type).replace(' / 1M tokens', '') : '-'}
                              </td>
                              {modelsGroup.some(model => model.price?.per_cached_input_write_token) && (
                                <td className="py-1 text-right text-zinc-200 pl-2">
                                  {m.price?.per_cached_input_write_token === 0 ? 'Free' :
                                   m.price?.per_cached_input_write_token !== undefined ? formatTokenPrice(m.price.per_cached_input_write_token, m.type).replace(' / 1M tokens', '') : '-'}
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
                {inputCost !== undefined && (
                  <div className="flex justify-between gap-4 text-xs">
                    <span className="text-zinc-400">Input:</span>
                    <span className="text-zinc-200">{inputCost === 0 ? 'Free' : formatTokenPrice(inputCost, model.type).replace(' / 1M tokens', '')}</span>
                  </div>
                )}
                {outputCost !== undefined && (
                  <div className="flex justify-between gap-4 text-xs">
                    <span className="text-zinc-400">Output:</span>
                    <span className="text-zinc-200">{outputCost === 0 ? 'Free' : formatTokenPrice(outputCost, model.type).replace(' / 1M tokens', '')}</span>
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
