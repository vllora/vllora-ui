import React, { useMemo, useState } from 'react';
import { LocalModel } from '@/types/models';
import { ProviderIcon } from '@/components/Icons/ProviderIcons';
import { Copy, Check, ChevronUp, ChevronDown, ChevronsUpDown, Upload, Download } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { LocalModelCard } from './LocalModelCard';
import { CostDisplay } from '@/components/shared/CostDisplay';
import { formatContextSize } from '@/utils/format';
import { ModalitiesDisplay } from '@/components/models/card-sections/ModalitiesDisplay';
import { CapabilitiesIcons } from '@/components/models/card-sections/CapabilitiesIcons';

interface LocalModelsTableProps {
  models: LocalModel[];
  copiedModel: string | null;
  copyModelName: (modelName: string) => Promise<void>;
}

type SortField = 'id' | 'provider' | 'context' | 'inputCost' | 'outputCost' | 'none';
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
      const aModelName = (a as any)._modelName || a.model;
      const bModelName = (b as any)._modelName || b.model;

      switch (sortField) {
        case 'id':
          // If grouped, sort by model name; otherwise by full id
          if ((a as any)._modelName && (b as any)._modelName) {
            compareResult = aModelName.localeCompare(bModelName);
          } else {
            compareResult = `${a.inference_provider.provider}/${a.model}`.localeCompare(`${b.inference_provider.provider}/${b.model}`);
          }
          break;
        case 'provider':
          const aProvider = a.inference_provider.provider;
          const bProvider = b.inference_provider.provider;
          compareResult = aProvider.localeCompare(bProvider);
          break;
        case 'context':
          compareResult = (a.limits.max_context_size || 0) - (b.limits.max_context_size || 0);
          break;
        case 'inputCost':
          compareResult = (a.price.per_input_token || 0) - (b.price.per_input_token || 0);
          break;
        case 'outputCost':
          compareResult = (a.price.per_output_token || 0) - (b.price.per_output_token || 0);
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
          <LocalModelCard key={`${model.inference_provider.provider}/${model.model}-${index}`} model={model} />
        ))}
      </div>

      {/* Desktop Table View */}
      <div className="hidden sm:block">
        {/* Table Header - Sticky positioned below the filter container */}
        <div className="sticky top-32 z-[5] bg-secondary border border-border rounded-t-lg px-4 py-3 shadow-sm">
          <div className="overflow-x-auto">
            <div className="w-full">
              <div className="flex items-center text-xs font-medium text-muted-foreground uppercase tracking-wide">
                <button
                  onClick={() => handleSort('id')}
                  className="w-[26%] flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer group"
                >
                  <span>MODEL ID</span>
                  {sortField === 'id' ? (
                    sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronsUpDown className="w-3 h-3 opacity-0 group-hover:opacity-50" />
                  )}
                </button>
                <button
                  onClick={() => handleSort('context')}
                  className="w-[12%] flex items-center justify-center gap-1 hover:text-foreground transition-colors cursor-pointer group"
                >
                  <span>CONTEXT SIZE</span>
                  {sortField === 'context' ? (
                    sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronsUpDown className="w-3 h-3 opacity-0 group-hover:opacity-50" />
                  )}
                </button>
                <button
                  onClick={() => handleSort('inputCost')}
                  className="w-[20%] flex items-center justify-center gap-1 hover:text-foreground transition-colors cursor-pointer group"
                >
                  <span>COST</span>
                  {sortField === 'inputCost' ? (
                    sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronsUpDown className="w-3 h-3 opacity-0 group-hover:opacity-50" />
                  )}
                </button>
                <div className="w-[15%] flex items-center justify-center gap-1">
                  <span>MODALITIES</span>
                </div>
                <div className="w-[15%] flex items-center justify-center gap-1">
                  <span>CAPABILITIES</span>
                </div>
                <button
                  onClick={() => handleSort('provider')}
                  className="w-[12%] flex items-center justify-end gap-1 hover:text-foreground transition-colors cursor-pointer group"
                >
                  <span>PROVIDER</span>
                  {sortField === 'provider' ? (
                    sortDirection === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                  ) : (
                    <ChevronsUpDown className="w-3 h-3 opacity-0 group-hover:opacity-50" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Table Body */}
        <div className="bg-card border border-t-0 border-border rounded-b-lg overflow-hidden">
          <div className="overflow-x-auto">
            <div className="w-full">
              <div className="divide-y divide-border">
              {sortedModels.map((model, index) => {
                // Get model group if available, otherwise treat as single model
                const modelGroup = (model as any)._modelGroup || [model];
                const modelName = (model as any)._modelName || model.model;
                
                // Get unique providers from the group (same logic as card view)
                const providers = Array.from(new Set(modelGroup.map((m: LocalModel) => m.inference_provider.provider)));

                return (
                  <TooltipProvider key={`${model.inference_provider.provider}/${model.model}-${index}`}>
                    <div className="group px-4 py-4 hover:bg-accent/50 transition-colors">
                      <div className="flex items-center">
                      {/* Model ID with Model Provider Icon */}
                      <div className="w-[26%] min-w-0 pr-3">
                        <div className="flex items-center gap-2">
                          <ProviderIcon
                            provider_name={model.model_provider}
                            className="w-4 h-4 flex-shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                      <span className="font-medium text-card-foreground truncate text-sm">
                                        {modelName}
                                      </span>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          e.preventDefault();
                                          copyModelName(`${modelGroup[0].inference_provider.provider}/${modelGroup[0].model}`);
                                        }}
                                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-accent rounded transition-all flex-shrink-0"
                                        title="Copy model ID"
                                      >
                                        {copiedModel === `${modelGroup[0].inference_provider.provider}/${modelGroup[0].model}` ? (
                                          <Check className="w-3 h-3 text-[rgb(var(--theme-500))]" />
                                        ) : (
                                          <Copy className="w-3 h-3 text-muted-foreground" />
                                        )}
                                      </button>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="bg-popover border-border">
                                    <span className="text-xs font-mono">{modelName}</span>
                                  </TooltipContent>
                                </Tooltip>
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {model.inference_provider.provider}/{model.model}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Context Window */}
                      <div className="w-[12%] flex justify-center">
                        <span className="text-xs font-mono text-foreground">
                          {formatContextSize(model.limits.max_context_size, true)}
                        </span>
                      </div>

                      {/* Price per 1M Tokens */}
                      <div className="w-[20%] flex justify-center">
                        <CostDisplay model={model} modelsGroup={modelGroup} className="justify-start" />
                      </div>

                      {/* Modalities */}
                      <div className="w-[15%] flex justify-center">
                        <ModalitiesDisplay 
                          inputFormats={model.input_formats}
                          outputFormats={model.output_formats}
                        />
                      </div>

                      {/* Capabilities */}
                      <div className="w-[15%] flex justify-center">
                        <CapabilitiesIcons 
                          capabilities={model.capabilities}
                          inputFormats={model.input_formats}
                          outputFormats={model.output_formats}
                          parameters={(model as any).parameters}
                          maxDisplay={10}
                        />
                      </div>

                      {/* Provider */}
                      <div className="w-[12%] flex justify-end">
                        <div className="flex flex-wrap gap-1">
                          {(providers as string[]).map((provider: string) => (
                            <TooltipProvider key={provider}>
                              <Tooltip>
                                <TooltipTrigger>
                                  <div className="flex items-center gap-1">
                                    <ProviderIcon
                                      provider_name={provider}
                                      className="w-5 h-5"
                                    />
                                    {providers.length === 1 && (
                                      <span className="text-xs text-foreground/80 truncate" title={provider}>
                                        {provider}
                                      </span>
                                    )}
                                  </div>
                                </TooltipTrigger>
                                <TooltipContent side="bottom" className="bg-popover border-border">
                                  <p className="text-xs font-medium">
                                    {provider}
                                  </p>
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                  </TooltipProvider>
                );
              })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};