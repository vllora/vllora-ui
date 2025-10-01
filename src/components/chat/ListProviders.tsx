import { ArrowsPointingOutIcon } from "@heroicons/react/24/outline"
import { ProviderIcon } from "../Icons/ProviderIcons"
import { cn } from "@/lib/utils"
import { Avatar } from "../ui/avatar"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"

interface ProviderInfo {
  provider: string;
  models: string[];
}

export const ListProviders = ({ providersInfo,
  maxVisibleProviders = 3,
  textDisplay
}: { providersInfo: ProviderInfo[]; maxVisibleProviders?: number, textDisplay?: () => React.ReactNode }): React.ReactElement => {
  // Sort providers to prioritize router when there are exactly 2 providers
  const sortedProviders = providersInfo.length === 2 && providersInfo.some(p => p.provider === 'router')
    ? [...providersInfo].sort((a, b) => {
        if (a.provider === 'router') return -1;
        if (b.provider === 'router') return 1;
        return 0;
      })
    : providersInfo;

  const visibleProviders = sortedProviders.length > maxVisibleProviders + 1 ? sortedProviders.slice(0, maxVisibleProviders) : sortedProviders;
  const remainingCount = sortedProviders.length - visibleProviders.length;

  // Generate tooltip content for all providers
  const generateAllProvidersTooltip = () => {
    return (
      <div className="max-w-xs p-3">
        <div className="flex items-center gap-2 mb-2">
          <h4 className="font-semibold">Providers List</h4>
        </div>
        <div className="pb-2">
          <Separator className="bg-zinc-800" />
        </div>
        <div className="space-y-4">
          {sortedProviders.map((provider, index) => (
            <div key={`provider-tooltip-${index}`}>
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full bg-zinc-800 flex items-center justify-center">
                    {provider.provider === 'router' ?
                      <ArrowsPointingOutIcon className="w-4 h-4 text-[#8b5cf6]" /> :
                      <ProviderIcon className="w-4 h-4 text-primary" provider_name={provider.provider || ''} />}
                  </div>
                  <p className="font-medium capitalize">{provider.provider}</p>
                </div>
                <Badge className="bg-zinc-800 text-zinc-300 hover:bg-zinc-800 border-none text-xs px-2">
                  {provider.models.length} {provider.models.length === 1 ? 'model' : 'models'}
                </Badge>
              </div>

              <div className="mb-3">
                <ul className="space-y-1.5 list-disc pl-4">
                  {provider.models.map((model, idx) => (
                    <li key={idx} className="text-xs text-zinc-300">
                      {model && model.includes('/') ? model.split('/').pop() : model}
                    </li>
                  ))}
                </ul>
              </div>

              {index < sortedProviders.length - 1 && (
                <div className="pt-1">
                  <Separator className="bg-zinc-800" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center">
            {visibleProviders.map((provider, index) => (
              <Avatar
                key={`provider-${index}`}
                className={cn(
                  "h-7 w-7 bg-background justify-center items-center rounded-full",
                  index !== 0 ? '-ml-2' : '',
                  'border border-[#41403ad2]'
                )}
              >
                {provider.provider === 'router' ?
                  <ArrowsPointingOutIcon className="w-4 h-4 text-[#8b5cf6]" /> :
                  <ProviderIcon className="w-4 h-4" provider_name={provider.provider || ''} />}
              </Avatar>
            ))}

            {remainingCount > 0 && (
              <Avatar
                className={cn(
                  "h-7 w-7 bg-background justify-center items-center rounded-full text-xs font-medium",
                  '-ml-2',
                  'border border-[#41403ad2]'
                )}
              >
                +{remainingCount}
              </Avatar>
            )}
            {textDisplay && <span className="text-xs text-muted-foreground">{textDisplay()}</span>}
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="center" className="border border-zinc-800 bg-zinc-900 shadow-xl rounded-lg p-0 animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95">
          {generateAllProvidersTooltip()}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
