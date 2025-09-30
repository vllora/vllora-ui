import React, { useState, useCallback, useMemo } from 'react';
import { ArrowUpRight, Check, Copy, Upload, Download } from 'lucide-react';
import { ModelPricing } from '@/types/models';
import { ProviderIcon } from '@/components/Icons/ProviderIcons';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { RankingsBadge } from '@/components/shared/RankingsBadge';
import { CostDisplay } from '@/components/shared/CostDisplay';
import { NewBadge } from '@/components/shared/NewBadge';
import { ProvidersSection } from '@/components/home-page/TrendingModelsSection/ProvidersSection';

export interface ModelCardProps {
  model: ModelPricing;
  variant?: 'trending' | 'new';
  modelsGroup?: ModelPricing[];
  showPublisherProvider?: boolean;
  showRanking?: boolean;
}

export const ModelCard: React.FC<ModelCardProps> = ({
  model,
  modelsGroup,
  showPublisherProvider = false,
  showRanking = false
}) => {
  const [copied, setCopied] = useState(false);

  const uniqueProviders = useMemo(
    () => Array.from(new Set(modelsGroup?.map(m => m.inference_provider.provider))),
    [modelsGroup]
  );

  const minRank = 10;

  const allRanks: { category: string; rank: number }[] = useMemo(() => {
    const ranks: { category: string; rank: number }[] = [];
    if (model.benchmark_info?.rank) {
      Object.entries(model.benchmark_info.rank).forEach(([category, rank]) => {
        if (rank <= minRank) {
          ranks.push({ category, rank });
        }
      });
    }
    return ranks.sort((a, b) => a.rank - b.rank);
  }, [model, minRank]);

  const recentRelease = useMemo(() => {
    const now = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(now.getDate() - 7);

    if (model.langdb_release_date) {
      const releaseDate = new Date(model.langdb_release_date);
      if (releaseDate > sevenDaysAgo) {
        const daysAgo = Math.floor((now.getTime() - releaseDate.getTime()) / (1000 * 60 * 60 * 24));
        return {
          releaseDate: model.langdb_release_date,
          daysAgo,
          displayText: daysAgo === 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `${daysAgo} days ago`
        };
      }
    }

    if (modelsGroup) {
      for (const m of modelsGroup) {
        if (m.langdb_release_date) {
          const releaseDate = new Date(m.langdb_release_date);
          if (releaseDate > sevenDaysAgo) {
            const daysAgo = Math.floor((now.getTime() - releaseDate.getTime()) / (1000 * 60 * 60 * 24));
            return {
              releaseDate: m.langdb_release_date,
              daysAgo,
              displayText: daysAgo === 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `${daysAgo} days ago`
            };
          }
        }
      }
    }

    return null;
  }, [model, modelsGroup]);

  const copyModelName = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      await navigator.clipboard.writeText(model.model);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy model name:', err);
    }
  }, [model.model]);

  return (
    <TooltipProvider>
      <div className="relative group overflow-hidden rounded-xl bg-zinc-900/50 border border-zinc-800/50 hover:border-zinc-700 transition-all duration-300">
        {showRanking && allRanks && allRanks.length > 0 && (
          <div className="absolute top-3 right-3 z-10">
            <RankingsBadge ranks={allRanks} size="sm" />
          </div>
        )}

        <div className="p-5">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Tooltip>
                <TooltipTrigger>
                  <div className="p-1.5 bg-zinc-800/30 rounded-lg group-hover:bg-zinc-800/50 transition-colors mt-0.5 relative z-10">
                    <ProviderIcon
                      provider_name={model.model_provider}
                      fallbackProviderName={model.inference_provider.provider}
                      className="w-4 h-4"
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="bg-zinc-800 border-zinc-700 text-white">
                  <p className="text-xs font-medium">{model.model_provider}</p>
                </TooltipContent>
              </Tooltip>
              <div className="flex flex-row flex-1 justify-between gap-1">
                <div className="flex items-center gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <a href={`/models/${model.model}`} className="relative z-10">
                        <h3 className="text-base font-semibold text-white hover:text-zinc-300 transition-colors cursor-pointer truncate">{model.model}</h3>
                      </a>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="bg-zinc-800 border-zinc-700 text-white">
                      <p className="text-xs">{model.model}</p>
                    </TooltipContent>
                  </Tooltip>
                  <button
                    onClick={copyModelName}
                    className="p-1 rounded hover:bg-zinc-700/50 transition-colors opacity-0 group-hover:opacity-100 relative z-10"
                    title={copied ? "Copied!" : "Copy model name"}
                  >
                    {copied ? (
                      <Check className="w-3.5 h-3.5 text-green-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-zinc-400 hover:text-white" />
                    )}
                  </button>
                  <ArrowUpRight className="w-3.5 h-3.5 text-zinc-500 opacity-0 group-hover:opacity-100 transition-all duration-200" />
                </div>

                {recentRelease && (
                  <NewBadge
                    releaseDate={recentRelease?.releaseDate}
                    daysAgo={recentRelease?.daysAgo}
                    showTooltip={true}
                    size="sm"
                  />
                )}
              </div>
            </div>
          </div>

          <div className="space-y-2 mt-2 mb-3">
            {showPublisherProvider && (
              <div className="flex items-center gap-2 text-xs">
                <div className="flex items-center gap-1.5 min-w-[120px] max-w-[45%]">
                  <span className="text-zinc-500 flex-shrink-0">Publisher:</span>
                  <a
                    href={`/publishers/${encodeURIComponent(model.model_provider)}`}
                    onClick={(e) => {
                      e.stopPropagation();
                    }}
                    className="font-medium text-zinc-100 hover:text-white transition-colors duration-200 underline decoration-zinc-600 hover:decoration-zinc-400 underline-offset-2 relative z-10 truncate"
                    title={model.model_provider}
                  >
                    {model.model_provider}
                  </a>
                </div>

                <ProvidersSection providers={uniqueProviders} maxDisplay={2} />
              </div>
            )}
            <div className="flex items-center justify-between text-xs">
              <span className="text-zinc-500">Context</span>
              <span className="text-zinc-300 font-medium">
                {model.limits?.max_context_size ?
                  `${Math.floor(model.limits.max_context_size / 1000)}K tokens` :
                  'Standard'}
              </span>
            </div>

            {(model.price?.per_input_token !== undefined || model.price?.per_output_token !== undefined || model.type === 'image_generation') && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-500">Cost</span>
                <CostDisplay model={model} modelsGroup={modelsGroup} />
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-zinc-800/50">
            <div className="flex  flex-1 justify-between items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2 text-xs text-zinc-500 cursor-help">
                    <Upload className="w-3 h-3" />
                    <span>{model.input_formats.join(', ')}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="bg-zinc-800 border-zinc-700 text-white max-w-xs">
                  <div className="space-y-1">
                    <p className="text-xs font-medium">Input Formats</p>
                    <p className="text-xs text-zinc-300">{model.input_formats.join(' • ')}</p>
                  </div>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2 text-xs text-zinc-500 cursor-help">
                    <Download className="w-3 h-3" />
                    <span>{model.output_formats.join(', ')}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="bg-zinc-800 border-zinc-700 text-white max-w-xs">
                  <div className="space-y-1">
                    <p className="text-xs font-medium">Output Formats</p>
                    <p className="text-xs text-zinc-300">{model.output_formats.join(' • ')}</p>
                  </div>
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};