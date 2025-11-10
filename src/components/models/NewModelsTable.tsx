import React, { useMemo, useState } from 'react';
import { ModelInfo } from '@/types/models';
import { ProviderIcon } from '@/components/Icons/ProviderIcons';
import { Copy, Check, ExternalLink, ChevronUp, ChevronDown, ChevronsUpDown, Upload, Download } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CostDisplay } from '@/components/shared/CostDisplay';
import { NewBadge } from '@/components/shared/NewBadge';
import { ProvidersSection } from '@/components/home-page/TrendingModelsSection/ProvidersSection';
import { RankingsBadge } from '@/components/shared/RankingsBadge';
import { ModelCard } from './ModelCard';

interface NewModelsTableProps {
  models: (ModelInfo & { _modelGroup?: ModelInfo[] })[];
  isNewModel: (model: ModelInfo) => boolean;
  copiedModel: string | null;
  copyModelName: (modelName: string) => Promise<void>;
  filterCategories?: string[];
}

type SortField = 'model' | 'context' | 'released' | 'providers' | 'inputCost' | 'outputCost';
type SortDirection = 'asc' | 'desc';

const formatContextSize = (contextSize: number, hideTokenAffix?: boolean) => {
  if (contextSize === 0) {
    return ``;
  }

  // Round to nearest million if close to a million value (within 5%)
  const millions = contextSize / 1000000;
  if (millions >= 0.95 && millions <= 10) {
    const roundedMillions = Math.round(millions);
    return `${roundedMillions}${hideTokenAffix ? "M" : "M tokens"}`;
  }

  // Use exact millions if it's a clean multiple
  if (contextSize % 1000000 === 0) {
    const exactMillions = contextSize / 1000000;
    return `${exactMillions}${hideTokenAffix ? "M" : "M tokens"}`;
  }

  // Use K for thousands
  if (contextSize >= 1000) {
    const thousands = contextSize / 1000;
    return `${Math.round(thousands)}${hideTokenAffix ? "K" : "K tokens"}`;
  }

  return `${contextSize}${hideTokenAffix ? "" : " tokens"}`;
};

const getModelFullName = (model: ModelInfo) => {
  return `${model.inference_provider.provider}/${model.model}`;
};

const getAllRanks = (props: {
  modelsGroup: ModelInfo[];
  model: ModelInfo;
  minRank?: number;
}) => {
  const { modelsGroup, model, minRank } = props;
  if (!modelsGroup || modelsGroup.length === 0) return [];

  // Find the model in modelsGroup that matches the current model
  const modelWithRank = modelsGroup.find(m =>
    m.model === model.model &&
    m.inference_provider.provider === model.inference_provider.provider
  );

  if (!modelWithRank?.benchmark_info?.rank) return [];

  // Get all ranks sorted by rank value, filtered by minRank if provided
  const ranks = Object.entries(modelWithRank.benchmark_info.rank)
    .map(([category, rank]) => ({ category, rank }))
    .filter(r => !minRank || r.rank <= minRank)
    .sort((a, b) => a.rank - b.rank);

  return ranks;
};

export const NewModelsTable: React.FC<NewModelsTableProps> = ({
  models,
  isNewModel,
  copiedModel,
  copyModelName,
  filterCategories
}) => {
  const [sortField, setSortField] = useState<SortField>('model');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedModels = useMemo(() => {
    return [...models].sort((a, b) => {
      const aIsNew = isNewModel(a);
      const bIsNew = isNewModel(b);

      // New models always first regardless of sort
      if (aIsNew && !bIsNew) return -1;
      if (!aIsNew && bIsNew) return 1;

      let compareResult = 0;

      switch (sortField) {
        case 'model':
          compareResult = a.model.localeCompare(b.model);
          break;
        case 'context':
          compareResult = a.limits.max_context_size - b.limits.max_context_size;
          break;
        case 'released':
          const aDate = a.release_date ? new Date(a.release_date).getTime() : 0;
          const bDate = b.release_date ? new Date(b.release_date).getTime() : 0;
          compareResult = aDate - bDate;
          break;
        case 'providers':
          const aProviders = a._modelGroup?.length || 1;
          const bProviders = b._modelGroup?.length || 1;
          compareResult = aProviders - bProviders;
          break;
        case 'inputCost':
          const aInputCost = a.price?.per_input_token || 0;
          const bInputCost = b.price?.per_input_token || 0;
          compareResult = aInputCost - bInputCost;
          break;
        case 'outputCost':
          const aOutputCost = a.price?.per_output_token || 0;
          const bOutputCost = b.price?.per_output_token || 0;
          compareResult = aOutputCost - bOutputCost;
          break;
        default:
          compareResult = 0;
      }

      return sortDirection === 'asc' ? compareResult : -compareResult;
    });
  }, [models, isNewModel, sortField, sortDirection]);

  return (
    <div>
      {/* Mobile Card View */}
      <div className="sm:hidden space-y-2">
          {sortedModels.map((model, index) => {
            const modelKey = getModelFullName(model);
            const showNewTag = isNewModel(model);
            const modelsGroup = model._modelGroup || [model];

            //const releaseInfo = getReleaseInfo();

            return (
              <ModelCard
                key={`${modelKey}-${index}`}
                model={model}
                variant={showNewTag ? 'new' : undefined}
                modelsGroup={modelsGroup}
                showPublisherProvider={true}
                showRanking={true}
              />
            );
          })}
      </div>

      {/* Desktop Table View */}
      <div className="hidden sm:block bg-zinc-900/50 border border-zinc-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-zinc-900">
          <div className="w-full">
            {/* Table Header */}
            <div className="bg-zinc-900 border-b border-zinc-800 px-4 py-3">
              <div className="flex items-center gap-2 text-xs font-medium text-zinc-400 uppercase tracking-wide">
                <button
                  onClick={() => handleSort('model')}
                  className="w-[22%] flex items-center gap-1 hover:text-zinc-200 transition-colors cursor-pointer group"
                >
                  <span>MODEL</span>
                  {sortField === 'model' ? (
                    sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronsUpDown className="w-3 h-3 opacity-0 group-hover:opacity-50" />
                  )}
                </button>
                <button
                  onClick={() => handleSort('providers')}
                  className="w-[18%] flex items-center gap-1 hover:text-zinc-200 transition-colors cursor-pointer group"
                >
                  <span>PROVIDERS</span>
                  {sortField === 'providers' ? (
                    sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronsUpDown className="w-3 h-3 opacity-0 group-hover:opacity-50" />
                  )}
                </button>
                <button
                  onClick={() => handleSort('context')}
                  className="w-[10%] flex items-center gap-1 hover:text-zinc-200 transition-colors cursor-pointer group"
                >
                  <span>CONTEXT</span>
                  {sortField === 'context' ? (
                    sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronsUpDown className="w-3 h-3 opacity-0 group-hover:opacity-50" />
                  )}
                </button>
                <div className="w-[17%] text-left">COST</div>
                <div className="w-[16%] text-left">FORMATS</div>
                <button
                  onClick={() => handleSort('released')}
                  className="w-[11%] flex items-center justify-center gap-1 hover:text-zinc-200 transition-colors cursor-pointer group"
                >
                  <span>RELEASED</span>
                  {sortField === 'released' ? (
                    sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronsUpDown className="w-3 h-3 opacity-0 group-hover:opacity-50" />
                  )}
                </button>
                <div className="w-[7%] text-left">RANK</div>
                <div className="w-[9%] text-center">ACTIONS</div>
              </div>
            </div>

            {/* Table Body */}
            <div className="divide-y divide-zinc-800">
              {sortedModels.map((model) => {
                const modelKey = getModelFullName(model);
                const showNewTag = isNewModel(model);
                const modelsGroup = model._modelGroup || [model];
                const allRanks = getAllRanks({ modelsGroup, model, minRank: 10 });

                // Calculate release info for new badge
                const getReleaseInfo = () => {
                  if (!showNewTag) return null;

                  // Check current model first
                  if (model.langdb_release_date) {
                    const releaseDate = new Date(model.langdb_release_date);
                    const now = new Date();
                    const daysAgo = Math.floor((now.getTime() - releaseDate.getTime()) / (1000 * 60 * 60 * 24));
                    return { releaseDate: model.langdb_release_date, daysAgo };
                  }

                  // Check models in group
                  for (const m of modelsGroup) {
                    if (m.langdb_release_date) {
                      const releaseDate = new Date(m.langdb_release_date);
                      const now = new Date();
                      const daysAgo = Math.floor((now.getTime() - releaseDate.getTime()) / (1000 * 60 * 60 * 24));
                      return { releaseDate: m.langdb_release_date, daysAgo };
                    }
                  }

                  return null;
                };

                const releaseInfo = getReleaseInfo();

                return (
                  <div key={modelKey} className="group px-4 py-4 hover:bg-zinc-800/50 transition-colors">
                    <div className="flex items-center gap-2">
                      {/* Model Name */}
                      <div className="w-[22%] min-w-0 pr-3">
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <div className='flex gap-2 w-full truncate'>
                                <div className='w-4 h-4'>
                                  <ProviderIcon
                                    provider_name={model.model_provider}
                                    fallbackProviderName={model.inference_provider.provider}
                                    className="w-4 h-4 text-zinc-400"
                                  />
                                </div>
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <a
                                        href={`/models/${model.model}`}
                                        className="font-medium text-white truncate text-sm cursor-pointer hover:underline decoration-zinc-600 hover:decoration-zinc-400 underline-offset-2"
                                      >
                                        {model.model}
                                      </a>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="bg-zinc-800 border-zinc-700 text-white">
                                      <span className="text-xs font-mono">{model.model}</span>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </div>
                              <div className="flex items-center gap-1">

                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    if (modelsGroup?.length > 1) {
                                      copyModelName(model.model)
                                    } else {
                                      copyModelName(getModelFullName(model))
                                    }
                                  }}
                                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-zinc-700 rounded transition-all"
                                  title="Copy model name"
                                >
                                  {copiedModel === model.model ? (
                                    <Check className="w-3 h-3 text-green-400" />
                                  ) : (
                                    <Copy className="w-3 h-3 text-zinc-400" />
                                  )}
                                </button>
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <div className="text-xs text-zinc-500">
                                by: <a
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
                              {showNewTag && releaseInfo && (
                                <NewBadge
                                  releaseDate={releaseInfo.releaseDate}
                                  daysAgo={releaseInfo.daysAgo}
                                  showTooltip={true}
                                  size="xs"
                                />
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Providers */}
                      <div className="w-[18%] overflow-hidden">
                        <ProvidersSection
                          providers={Array.from(new Set(modelsGroup.map(m => m.inference_provider.provider)))}
                          maxDisplay={2}
                          showLabel={false}
                          className="justify-start"
                        />
                      </div>

                      {/* Context */}
                      <div className="w-[10%]">
                        <span className="text-xs font-mono text-zinc-300">
                          {formatContextSize(model.limits.max_context_size, true)}
                        </span>
                      </div>

                      {/* Cost Column */}
                      <div className="w-[17%]">
                        <CostDisplay model={model} className="justify-start" />
                      </div>

                      {/* Input/Output Formats */}
                      <div className="w-[16%]">
                        <div className="flex items-center justify-start gap-3">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-1 cursor-help">
                                  <Upload className="w-3 h-3 text-zinc-400" />
                                  <span className="text-xs text-zinc-400">
                                    {model.input_formats?.slice(0, 2).join(', ')}
                                    {model.input_formats && model.input_formats.length > 2 && ` +${model.input_formats.length - 2}`}
                                  </span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="bg-zinc-800 border-zinc-700 text-white max-w-xs">
                                <div className="space-y-1">
                                  <p className="text-xs font-medium">Input Formats</p>
                                  <p className="text-xs text-zinc-300">{model.input_formats?.join(' • ')}</p>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-center gap-1 cursor-help">
                                  <Download className="w-3 h-3 text-zinc-400" />
                                  <span className="text-xs text-zinc-400">
                                    {model.output_formats?.slice(0, 2).join(', ')}
                                    {model.output_formats && model.output_formats.length > 2 && ` +${model.output_formats.length - 2}`}
                                  </span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="bg-zinc-800 border-zinc-700 text-white max-w-xs">
                                <div className="space-y-1">
                                  <p className="text-xs font-medium">Output Formats</p>
                                  <p className="text-xs text-zinc-300">{model.output_formats?.join(' • ')}</p>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </div>

                      {/* Released Date */}
                      <div className="w-[11%] text-center ">
                        {model.release_date && (
                          <span className="text-xs text-zinc-400">
                            {new Date(model.release_date).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: '2-digit'
                            })}
                          </span>
                        )}
                      </div>

                      {/* Ranking */}
                      <div className="w-[7%] flex justify-start">
                        <RankingsBadge ranks={allRanks} size="sm" filterCategories={filterCategories} />
                      </div>

                      {/* Actions */}
                      <div className="w-[9%] flex justify-center gap-1 ">

                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <a
                                href={`/models/${model.model}`}
                                className="p-1 hover:bg-zinc-700 rounded transition-colors text-zinc-400 hover:text-white"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="text-xs">View details</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};