import React from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { getModelCapabilities } from '@/utils/capabilityUtils';
import { cn } from '@/lib/utils';

interface CapabilitiesIconsProps {
  capabilities?: string[];
  inputFormats?: string[];
  outputFormats?: string[];
  parameters?: any;
  maxDisplay?: number;
  className?: string;
}

export const CapabilitiesIcons: React.FC<CapabilitiesIconsProps> = ({
  capabilities,
  inputFormats,
  outputFormats,
  parameters,
  maxDisplay = 3,
  className = ""
}) => {
  const detectedCapabilities = getModelCapabilities(capabilities, inputFormats, outputFormats, parameters);
  const visibleCapabilities = detectedCapabilities.slice(0, maxDisplay);
  const remainingCount = Math.max(0, detectedCapabilities.length - maxDisplay);

  if (detectedCapabilities.length === 0) {
    return (
      <div className={className}>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-0.5 ${className}`}>
      {visibleCapabilities.map((capability) => {
        const IconComponent = capability.icon;
        
        return (
          <Tooltip key={capability.label}>
            <TooltipTrigger asChild>
              <div className="flex items-center justify-center w-5 h-5">
                <IconComponent 
                  className={cn(
                    "w-4 h-4 transition-colors",
                    capability.className || "text-zinc-400"
                  )} 
                />
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="bg-zinc-800 border-zinc-700 text-white">
              <div className="space-y-1">
                <p className="text-xs font-medium">{capability.label}</p>
                <p className="text-xs text-zinc-300">{capability.description}</p>
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
            <div className="space-y-1">
              <p className="text-xs font-medium">Additional Capabilities</p>
              {detectedCapabilities.slice(maxDisplay).map((capability) => (
                <p key={capability.label} className="text-xs text-zinc-300">
                  {capability.label}
                </p>
              ))}
            </div>
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
};


