import React, { useMemo, useState } from 'react';
import { LocalModel } from '@/types/models';
import { ProviderIcon } from '@/components/Icons/ProviderIcons';
import { Copy, Check, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { LocalModelCard } from './LocalModelCard';

interface LocalModelsTableProps {
  models: LocalModel[];
  copiedModel: string | null;
  copyModelName: (modelName: string) => Promise<void>;
}

type SortField = 'id' | 'provider' | 'owner' | 'created' | 'none';
type SortDirection = 'asc' | 'desc';

export const LocalModelsTable: React.FC<LocalModelsTableProps> = ({
  models,
  copiedModel,
  copyModelName,
}) => {
  const [sortField, setSortField] = useState<SortField>('none');
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
    // If no sorting, return models in original order
    if (sortField === 'none') {
      return models;
    }

    return [...models].sort((a, b) => {
      let compareResult = 0;

      // Check if models are grouped
      const aModelName = (a as any)._modelName || a.id.split('/').slice(1).join('/');
      const bModelName = (b as any)._modelName || b.id.split('/').slice(1).join('/');
      const aModelGroup = (a as any)._modelGroup || [a];
      const bModelGroup = (b as any)._modelGroup || [b];

      switch (sortField) {
        case 'id':
          // If grouped, sort by model name; otherwise by full id
          if ((a as any)._modelName && (b as any)._modelName) {
            compareResult = aModelName.localeCompare(bModelName);
          } else {
            compareResult = a.id.localeCompare(b.id);
          }
          break;
        case 'provider':
          const aProvider = aModelGroup[0].id.split('/')[0];
          const bProvider = bModelGroup[0].id.split('/')[0];
          compareResult = aProvider.localeCompare(bProvider);
          break;
        case 'owner':
          compareResult = aModelGroup[0].owned_by.localeCompare(bModelGroup[0].owned_by);
          break;
        case 'created':
          compareResult = aModelGroup[0].created - bModelGroup[0].created;
          break;
        default:
          compareResult = 0;
      }

      return sortDirection === 'asc' ? compareResult : -compareResult;
    });
  }, [models, sortField, sortDirection]);

  return (
    <div>
      {/* Mobile Card View */}
      <div className="sm:hidden space-y-2">
        {sortedModels.map((model, index) => (
          <LocalModelCard key={`${model.id}-${index}`} model={model} />
        ))}
      </div>

      {/* Desktop Table View */}
      <div className="hidden sm:block bg-zinc-900/50 border border-zinc-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-zinc-900">
          <div className="w-full">
            {/* Table Header */}
            <div className="bg-zinc-900 border-b border-zinc-800 px-4 py-3">
              <div className="flex items-center gap-2 text-xs font-medium text-zinc-400 uppercase tracking-wide">
                <button
                  onClick={() => handleSort('id')}
                  className="w-[40%] flex items-center gap-1 hover:text-zinc-200 transition-colors cursor-pointer group"
                >
                  <span>MODEL ID</span>
                  {sortField === 'id' ? (
                    sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronsUpDown className="w-3 h-3 opacity-0 group-hover:opacity-50" />
                  )}
                </button>
                <button
                  onClick={() => handleSort('provider')}
                  className="w-[20%] flex items-center gap-1 hover:text-zinc-200 transition-colors cursor-pointer group"
                >
                  <span>PROVIDER</span>
                  {sortField === 'provider' ? (
                    sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronsUpDown className="w-3 h-3 opacity-0 group-hover:opacity-50" />
                  )}
                </button>
                <button
                  onClick={() => handleSort('owner')}
                  className="w-[25%] flex items-center gap-1 hover:text-zinc-200 transition-colors cursor-pointer group"
                >
                  <span>OWNER</span>
                  {sortField === 'owner' ? (
                    sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronsUpDown className="w-3 h-3 opacity-0 group-hover:opacity-50" />
                  )}
                </button>
                <button
                  onClick={() => handleSort('created')}
                  className="w-[15%] flex items-center gap-1 hover:text-zinc-200 transition-colors cursor-pointer group"
                >
                  <span>CREATED</span>
                  {sortField === 'created' ? (
                    sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronsUpDown className="w-3 h-3 opacity-0 group-hover:opacity-50" />
                  )}
                </button>
              </div>
            </div>

            {/* Table Body */}
            <div className="divide-y divide-zinc-800">
              {sortedModels.map((model, index) => {
                // Get model group if available, otherwise treat as single model
                const modelGroup = (model as any)._modelGroup || [model];
                const modelName = (model as any)._modelName || model.id.split('/').slice(1).join('/');
                const providers = Array.from(new Set(modelGroup.map((m: LocalModel) => m.id.split('/')[0])));

                return (
                  <div key={`${model.id}-${index}`} className="group px-4 py-4 hover:bg-zinc-800/50 transition-colors">
                    <div className="flex items-center gap-2">
                      {/* Model Name */}
                      <div className="w-[40%] min-w-0 pr-3">
                        <div className="flex items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                      <span className="font-medium text-white truncate text-sm">
                                        {modelName}
                                      </span>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          e.preventDefault();
                                          copyModelName(modelGroup[0].id);
                                        }}
                                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-zinc-700 rounded transition-all flex-shrink-0"
                                        title="Copy model ID"
                                      >
                                        {copiedModel === modelGroup[0].id ? (
                                          <Check className="w-3 h-3 text-green-400" />
                                        ) : (
                                          <Copy className="w-3 h-3 text-zinc-400" />
                                        )}
                                      </button>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="bg-zinc-800 border-zinc-700 text-white">
                                    <span className="text-xs font-mono">{modelName}</span>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Providers */}
                      <div className="w-[20%] overflow-hidden">
                        <div className="flex flex-wrap gap-1.5">
                          {(providers as string[]).map((provider: string) => (
                            <TooltipProvider key={provider}>
                              <Tooltip>
                                <TooltipTrigger>
                                  <div className="p-1 bg-zinc-800/30 rounded hover:bg-zinc-800/50 transition-colors">
                                    <ProviderIcon
                                      provider_name={provider}
                                      className="w-3.5 h-3.5"
                                    />
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="bg-zinc-800 border-zinc-700 text-white">
                                  <p className="text-xs font-medium">{provider}</p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ))}
                        </div>
                      </div>

                      {/* Owner */}
                      <div className="w-[25%]">
                        <span className="text-sm text-zinc-300">{modelGroup[0].owned_by}</span>
                      </div>

                      {/* Created Date */}
                      <div className="w-[15%]">
                        <span className="text-xs text-zinc-400">
                          {new Date(modelGroup[0].created * 1000).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: '2-digit'
                          })}
                        </span>
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