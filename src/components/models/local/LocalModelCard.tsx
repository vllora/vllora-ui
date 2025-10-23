import React, { useState, useCallback } from 'react';
import { Check, Copy } from 'lucide-react';
import { LocalModel } from '@/types/models';
import { ProviderIcon } from '@/components/Icons/ProviderIcons';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export interface LocalModelCardProps {
  model: LocalModel;
}

export const LocalModelCard: React.FC<LocalModelCardProps> = ({ model }) => {
  const [copiedModelName, setCopiedModelName] = useState(false);
  const [copiedProviderId, setCopiedProviderId] = useState<string | null>(null);

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

  const copyProviderModelId = useCallback(async (e: React.MouseEvent, provider: string) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      const fullId = `${provider}/${modelName}`;
      await navigator.clipboard.writeText(fullId);
      setCopiedProviderId(fullId);
      setTimeout(() => setCopiedProviderId(null), 2000);
    } catch (err) {
      console.error('Failed to copy provider model ID:', err);
    }
  }, [modelName]);


  return (
    <TooltipProvider>
      <div className="relative group overflow-hidden rounded-xl bg-card border border-border hover:border-border/80 transition-all duration-300">
        <div className="p-5">
          <div className="flex flex-col gap-3">
            {/* Header with Model Name */}
            <div className="flex items-start gap-3">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Tooltip>
                  <TooltipTrigger>
                    <div className="p-1.5 bg-secondary rounded-lg group-hover:bg-secondary/80 transition-colors">
                      <ProviderIcon
                        provider_name={modelGroup[0].model_provider}
                        className="w-4 h-4"
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="bg-popover border-border">
                    <p className="text-xs font-medium">Model Provider: {modelGroup[0].model_provider}</p>
                  </TooltipContent>
                </Tooltip>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <h3
                          onClick={copyModelId}
                          className="text-base font-semibold text-card-foreground hover:text-muted-foreground transition-colors cursor-pointer truncate"
                        >
                          {modelName}
                        </h3>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="bg-popover border-border">
                        <p className="text-xs">{copiedModelName ? "Copied!" : "Click to copy"}</p>
                      </TooltipContent>
                    </Tooltip>
                    <button
                      onClick={copyModelId}
                      className="p-1 rounded hover:bg-accent transition-colors opacity-0 group-hover:opacity-100"
                      title={copiedModelName ? "Copied!" : "Copy model ID"}
                    >
                      {copiedModelName ? (
                        <Check className="w-3.5 h-3.5 text-[rgb(var(--theme-500))]" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Model Details */}
            <div className="space-y-2">
              {/* Providers */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{providers.length > 1 ? 'Providers' : 'Provider'}</span>
                <div className="flex flex-wrap gap-1.5 justify-end">
                  {(providers as string[]).map((provider: string) => {
                    const fullId = `${provider}/${modelName}`;
                    const isCopied = copiedProviderId === fullId;
                    return (
                      <Tooltip key={provider}>
                        <TooltipTrigger>
                          <div
                            onClick={(e) => copyProviderModelId(e, provider)}
                            className="p-1 bg-secondary rounded hover:bg-secondary/80 transition-colors cursor-pointer"
                          >
                            {isCopied ? (
                              <Check className="w-4 h-4 text-[rgb(var(--theme-500))]" />
                            ) : (
                              <ProviderIcon
                                provider_name={provider}
                                className="w-4 h-4"
                              />
                            )}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="bg-popover border-border">
                          <p className="text-xs font-medium">
                            {isCopied ? 'Copied!' : `Click to copy ${fullId}`}
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};