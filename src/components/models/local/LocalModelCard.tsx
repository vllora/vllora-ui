import React, { useState, useCallback } from 'react';
import { Check, Copy } from 'lucide-react';
import { LocalModel } from '@/types/models';
import { ProviderIcon } from '@/components/Icons/ProviderIcons';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export interface LocalModelCardProps {
  model: LocalModel;
}

export const LocalModelCard: React.FC<LocalModelCardProps> = ({ model }) => {
  const [copied, setCopied] = useState(false);

  // Get model group if available, otherwise treat as single model
  const modelGroup = (model as any)._modelGroup || [model];
  const modelName = (model as any)._modelName || model.id.split('/').slice(1).join('/');

  // Get unique providers from the group
  const providers = Array.from(new Set(modelGroup.map((m: LocalModel) => m.id.split('/')[0])));

  const copyModelId = useCallback(async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      // Copy the first model's full ID
      await navigator.clipboard.writeText(modelGroup[0].id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy model ID:', err);
    }
  }, [modelGroup]);

  // Format timestamp to readable date
  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <TooltipProvider>
      <div className="relative group overflow-hidden rounded-xl bg-zinc-900/50 border border-zinc-800/50 hover:border-zinc-700 transition-all duration-300">
        <div className="p-5">
          <div className="flex flex-col gap-3">
            {/* Header with Model Name */}
            <div className="flex items-start gap-3">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Tooltip>
                  <TooltipTrigger>
                    <div className="p-1.5 bg-zinc-800/30 rounded-lg group-hover:bg-zinc-800/50 transition-colors">
                      <ProviderIcon
                        provider_name={modelGroup[0].owned_by}
                        className="w-4 h-4"
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="bg-zinc-800 border-zinc-700 text-white">
                    <p className="text-xs font-medium">{modelGroup[0].owned_by}</p>
                  </TooltipContent>
                </Tooltip>

                <div className="flex-1 min-w-0">
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
                        <p className="text-xs">{copied ? "Copied!" : "Click to copy"}</p>
                      </TooltipContent>
                    </Tooltip>
                    <button
                      onClick={copyModelId}
                      className="p-1 rounded hover:bg-zinc-700/50 transition-colors opacity-0 group-hover:opacity-100"
                      title={copied ? "Copied!" : "Copy model ID"}
                    >
                      {copied ? (
                        <Check className="w-3.5 h-3.5 text-green-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5 text-zinc-400 hover:text-white" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Model Details */}
            <div className="space-y-2">
              {/* Providers */}
              <div className="flex items-start justify-between text-xs">
                <span className="text-zinc-500">{providers.length > 1 ? 'Providers' : 'Provider'}</span>
                <div className="flex flex-wrap gap-1.5 justify-end">
                  {(providers as string[]).map((provider: string) => (
                    <Tooltip key={provider}>
                      <TooltipTrigger>
                        <div className="p-1 bg-zinc-800/30 rounded group-hover:bg-zinc-800/50 transition-colors">
                          <ProviderIcon
                            provider_name={provider}
                            className="w-4 h-4"
                          />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="bg-zinc-800 border-zinc-700 text-white">
                        <p className="text-xs font-medium">{provider}</p>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-500">Owner</span>
                <span className="text-zinc-300 font-medium">{modelGroup[0].owned_by}</span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-500">Created</span>
                <span className="text-zinc-300 font-medium">{formatDate(modelGroup[0].created)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};