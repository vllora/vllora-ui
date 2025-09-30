import React, { Fragment } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip';
import { ProviderIcon } from '@/components/Icons/ProviderIcons';

interface ProvidersSectionProps {
  providers: string[];
  maxDisplay?: number;
  showLabel?: boolean;
  className?: string;
}

export const ProvidersSection: React.FC<ProvidersSectionProps> = ({
  providers,
  maxDisplay = 2,
  showLabel = true,
  className = ""
}) => {
  if (!providers || providers.length === 0) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
        <div className={`flex items-center gap-1 ${showLabel ? 'flex-1 min-w-0 justify-end' : 'min-w-0'} cursor-help  ${className}`}>
          {showLabel && <span className="text-zinc-500 flex-shrink-0">Providers:</span>}
          <div className="flex items-center gap-1 min-w-0 overflow-hidden">
            {providers.slice(0, maxDisplay).map((p, index) => (
              <Fragment key={p}>
                {index > 0 && <span className="text-zinc-600">·</span>}
                <a
                  href={`/providers/${p}`}
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                  className="text-zinc-300 text-xs hover:text-white transition-colors duration-200 font-medium underline decoration-zinc-600 hover:decoration-zinc-400 underline-offset-2 relative z-10 whitespace-nowrap"
                >
                  {p}
                </a>
              </Fragment>
            ))}
            {providers.length > maxDisplay && (
              <>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-400 text-xs">
                  +{providers.length - maxDisplay}
                </span>
              </>
            )}
          </div>
        </div>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className="bg-zinc-900/95 backdrop-blur-sm border border-zinc-700/50 text-white max-w-sm p-0 shadow-xl shadow-black/20 overflow-hidden"
      >
        <div>
          <div className="bg-gradient-to-r from-zinc-800/50 to-zinc-800/30 px-3 py-2 border-b border-zinc-700/50">
            <div className="flex items-center gap-2  justify-between">
              <p className="text-xs font-medium text-zinc-200">
                Available Providers
              </p>
            </div>
          </div>

          <div className="p-2">
            <div className="space-y-1">
              {providers.map((provider) => (
                <a
                  key={provider}
                  href={`/providers/${provider}`}
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                  className="flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-zinc-800/60 transition-all duration-150 group cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <ProviderIcon
                      provider_name={provider}
                      className="w-4 h-4 rounded-sm flex-shrink-0"
                    />
                    <span className="text-xs text-zinc-300 group-hover:text-white font-medium">
                      {provider}
                    </span>
                  </div>
                  <svg
                    className="w-3 h-3 text-zinc-600 group-hover:text-zinc-400 transition-all duration-150 group-hover:translate-x-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </a>
              ))}
            </div>
          </div>

          <div className="bg-zinc-800/20 px-3 py-1.5 border-t border-zinc-700/30">
            <p className="text-[10px] text-zinc-500 text-center">Click to view provider details</p>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
    </TooltipProvider>
  );
};