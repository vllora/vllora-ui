import React from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ProviderIcon } from '@/components/Icons/ProviderIcons';
import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';

interface ProvidersIconsProps {
  providers: string[];
  maxDisplay?: number;
  className?: string;
  providerStatusMap?: Map<string, boolean>;
}

export const ProvidersIcons: React.FC<ProvidersIconsProps> = ({
  providers,
  maxDisplay = 3,
  className = "",
  providerStatusMap
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
    <div className={`flex items-center gap-1 ${className}`}>
      {visibleProviders.map((provider) => {
        const isConfigured = providerStatusMap?.get(provider.toLowerCase()) ?? false;
        
        return (
          <Tooltip key={provider}>
            <TooltipTrigger asChild>
              <div className="flex items-center justify-center w-5 h-5">
                <ProviderIcon 
                  provider_name={provider}
                  className="w-5 h-5"
                />
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="bg-zinc-800 border-zinc-700 text-white">
              <div className="space-y-1.5">
                <div>
                  <p className="text-xs font-medium">Provider</p>
                  <p className="text-xs text-zinc-300">{provider}</p>
                </div>
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-zinc-700/50">
                  <p className="text-xs text-zinc-400">
                    {isConfigured ? (
                      <span className="text-green-400">✓ Configured</span>
                    ) : (
                      <span className="text-yellow-400">⚠ Not configured</span>
                    )}
                  </p>
                  {!isConfigured && (
                    <Link 
                      to="/settings" 
                      className="flex items-center gap-0.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      Settings
                      <ArrowUpRight className="w-3 h-3" />
                    </Link>
                  )}
                </div>
              </div>
            </TooltipContent>
          </Tooltip>
        );
      })}
      
      {remainingCount > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center justify-center w-5 h-5">
              <span className="text-xs text-zinc-500 font-medium">
                +{remainingCount}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="bg-zinc-800 border-zinc-700 text-white">
            <div className="space-y-1.5">
              <p className="text-xs font-medium">Additional Providers</p>
              {providers.slice(maxDisplay).map((provider) => {
                const isConfigured = providerStatusMap?.get(provider.toLowerCase()) ?? false;
                
                return (
                  <div key={provider} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-1.5">
                      <ProviderIcon 
                        provider_name={provider}
                        className="w-4 h-4"
                      />
                      <span className="text-xs text-zinc-300">{provider}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {isConfigured ? (
                        <span className="text-xs text-green-400">✓</span>
                      ) : (
                        <>
                          <span className="text-xs text-yellow-400">⚠</span>
                          <Link 
                            to="/settings" 
                            className="flex items-center gap-0.5 text-xs text-blue-400 hover:text-blue-300 transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ArrowUpRight className="w-3 h-3" />
                          </Link>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
};


