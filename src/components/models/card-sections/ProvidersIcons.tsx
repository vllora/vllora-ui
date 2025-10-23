import React from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ProviderIcon } from '@/components/Icons/ProviderIcons';

interface ProvidersIconsProps {
  providers: string[];
  maxDisplay?: number;
  className?: string;
}

export const ProvidersIcons: React.FC<ProvidersIconsProps> = ({
  providers,
  maxDisplay = 3,
  className = ""
}) => {
  if (!providers || providers.length === 0) {
    return (
      <div className={`text-xs text-zinc-500 ${className}`}>
        Unknown
      </div>
    );
  }

  const visibleProviders = providers.slice(0, maxDisplay);
  const remainingCount = Math.max(0, providers.length - maxDisplay);

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      {visibleProviders.map((provider) => (
        <Tooltip key={provider}>
          <TooltipTrigger asChild>
            <div className="flex items-center justify-center w-6 h-6">
              <ProviderIcon 
                provider_name={provider}
                className="w-6 h-6"
              />
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="bg-zinc-800 border-zinc-700 text-white">
            <div className="space-y-1">
              <p className="text-xs font-medium">Provider</p>
              <p className="text-xs text-zinc-300">{provider}</p>
            </div>
          </TooltipContent>
        </Tooltip>
      ))}
      
      {remainingCount > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center justify-center w-6 h-6">
              <span className="text-xs text-zinc-500 font-medium">
                +{remainingCount}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="bg-zinc-800 border-zinc-700 text-white">
            <div className="space-y-1">
              <p className="text-xs font-medium">Additional Providers</p>
              {providers.slice(maxDisplay).map((provider) => (
                <div key={provider} className="flex items-center gap-1">
                  <ProviderIcon 
                    provider_name={provider}
                    className="w-4 h-4"
                  />
                  <span className="text-xs text-zinc-300">{provider}</span>
                </div>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
};


