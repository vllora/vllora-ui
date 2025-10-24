import React, { useState, useCallback } from 'react';
import { Check, Copy } from 'lucide-react';
import { LocalModel } from '@/types/models';
import { ProviderIcon } from '@/components/Icons/ProviderIcons';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ModalitiesDisplay } from '@/components/models/card-sections/ModalitiesDisplay';
import { CapabilitiesIcons } from '@/components/models/card-sections/CapabilitiesIcons';
import { ProvidersIcons } from '@/components/models/card-sections/ProvidersIcons';
import { CostDisplay } from '@/components/shared/CostDisplay';

export interface LocalModelCardProps {
  model: LocalModel;
  providerStatusMap?: Map<string, boolean>;
}

export const LocalModelCard: React.FC<LocalModelCardProps> = ({ model, providerStatusMap }) => {
  const [copiedModelName, setCopiedModelName] = useState(false);

  // Get model group if available, otherwise treat as single model
  const modelGroup = (model as any)._modelGroup || [model];
  const modelName = (model as any)._modelName || model.model;

  // Get unique providers from the group
  const providers = Array.from(new Set(modelGroup.map((m: LocalModel) => m.inference_provider.provider)));

  const copyModelId = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      // If multiple providers (grouped), copy just the model name
      // Otherwise, copy the full model ID with provider prefix
      const textToCopy = providers.length > 1 ? modelName : `${modelGroup[0].inference_provider.provider}/${modelGroup[0].model}`;
      await navigator.clipboard.writeText(textToCopy);
      setCopiedModelName(true);
      setTimeout(() => setCopiedModelName(false), 2000);
    } catch (err) {
      console.error('Failed to copy model ID:', err);
    }
  }, [modelGroup, modelName, providers.length]);


  return (
    <TooltipProvider>
      <div className="relative group overflow-hidden rounded-xl bg-zinc-900/50 border border-zinc-800/50 hover:border-zinc-700 transition-all duration-300">
        <div className="p-5">
          {/* Header Section */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              {/* Publisher Icon */}
              <Tooltip>
                <TooltipTrigger>
                  <div className="p-1 bg-zinc-800/30 rounded-lg group-hover:bg-zinc-800/50 transition-colors relative z-10">
                    <ProviderIcon
                      provider_name={modelGroup[0].model_provider}
                      className="w-6 h-6"
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="bg-zinc-800 border-zinc-700 text-white">
                  <p className="text-xs font-medium">{modelGroup[0].model_provider}</p>
                </TooltipContent>
              </Tooltip>

              {/* Model Name and Actions */}
              <div className="flex flex-row flex-1 justify-between gap-1">
                <div className="flex items-center gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <h3
                        onClick={copyModelId}
                        className="text-base font-semibold text-white hover:text-zinc-300 transition-colors cursor-pointer truncate"
                      >
                        {modelName}
                      </h3>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="bg-zinc-800 border-zinc-700 text-white">
                      <p className="text-xs">{copiedModelName ? "Copied!" : "Click to copy"}</p>
                    </TooltipContent>
                  </Tooltip>
                  <button
                    onClick={copyModelId}
                    className="p-1 rounded hover:bg-zinc-700/50 transition-colors opacity-0 group-hover:opacity-100 relative z-10"
                    title={copiedModelName ? "Copied!" : "Copy model ID"}
                  >
                    {copiedModelName ? (
                      <Check className="w-3.5 h-3.5 text-green-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-zinc-400 hover:text-white" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Description Section */}
          <div className="mt-3 mb-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <p className="text-sm text-zinc-400 leading-relaxed line-clamp-2 cursor-help">
                  {model.description}
                </p>
              </TooltipTrigger>
              <TooltipContent side="top" className="bg-zinc-800 border-zinc-700 text-white max-w-xs">
                <p className="text-xs">{model.description}</p>
              </TooltipContent>
            </Tooltip>
          </div>

          {/* Main Info Section - 3 Columns */}
          <div className="grid grid-cols-3 gap-4 pt-3 border-t border-zinc-800/50">
            {/* Providers Column - Left Aligned */}
            <div className="space-y-1">
              <p className="text-xs text-zinc-500">Providers</p>
              <div className="flex justify-start">
                <ProvidersIcons 
                  providers={providers as string[]}
                  maxDisplay={2}
                  providerStatusMap={providerStatusMap}
                />
              </div>
            </div>

            {/* Modalities Column - Center Aligned */}
            <div className="space-y-1">
              <p className="text-xs text-zinc-500 text-center">Modalities</p>
              <div className="flex justify-center">
                <ModalitiesDisplay 
                  inputFormats={model.input_formats}
                  outputFormats={model.output_formats}
                />
              </div>
            </div>

            {/* Capabilities Column - Right Aligned */}
            <div className="space-y-1">
              <p className="text-xs text-zinc-500 text-right">Capabilities</p>
              <div className="flex justify-end">
                <CapabilitiesIcons 
                  capabilities={model.capabilities}
                  inputFormats={model.input_formats}
                  outputFormats={model.output_formats}
                  parameters={model.parameters}
                  maxDisplay={10}
                />
              </div>
            </div>
          </div>

          {/* Bottom Info Section */}
          <div className="space-y-2 mt-4 pt-3 border-t border-zinc-800/50">
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
                <CostDisplay model={model} modelsGroup={modelGroup} />
              </div>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};