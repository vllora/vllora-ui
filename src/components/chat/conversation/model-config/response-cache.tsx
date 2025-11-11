import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";

interface ResponseCacheConfigProps {
  config: Record<string, any>;
  onConfigChange: (config: Record<string, any>) => void;
}

export function ResponseCacheConfig({
  config,
  onConfigChange,
}: ResponseCacheConfigProps) {
  const cacheConfig = config.extra?.cache;
  const cacheEnabled = !!cacheConfig;
  const expirationTime = cacheConfig?.expiration_time ?? 1200; // 20 minutes default

  const toggleCache = () => {
    const newConfig = { ...config };
    if (cacheEnabled) {
      // Disable caching - remove cache from extra
      if (newConfig.extra) {
        const { cache, ...restExtra } = newConfig.extra;
        if (Object.keys(restExtra).length > 0) {
          newConfig.extra = restExtra;
        } else {
          delete newConfig.extra;
        }
      }
    } else {
      // Enable caching with defaults
      newConfig.extra = {
        ...newConfig.extra,
        cache: {
          type: "exact",
          expiration_time: 1200,
        },
      };
    }
    onConfigChange(newConfig);
  };

  const updateExpiration = (value: number) => {
    if (!cacheEnabled) return;

    onConfigChange({
      ...config,
      extra: {
        ...config.extra,
        cache: {
          ...config.extra?.cache,
          type: "exact",
          expiration_time: value,
        },
      },
    });
  };

  return (
    <div className="space-y-3 py-2">
      {/* Enable/Disable Toggle */}
      <div className="flex items-center justify-between space-x-2 py-1">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="cache_enabled" className="text-sm font-medium">
            Response Caching
          </Label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-xs">Cache responses for identical prompts to reduce latency and costs. Uses exact match only.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Switch
          id="cache_enabled"
          checked={cacheEnabled}
          onCheckedChange={toggleCache}
        />
      </div>

      {/* Expiration Time - only shown when enabled */}
      {cacheEnabled && (
        <div className="space-y-2 py-1 pl-1">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Label htmlFor="cache_expiration" className="text-sm font-medium whitespace-nowrap">
                Expiration
              </Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help flex-shrink-0" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-xs">Cached responses will expire after this duration</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>

            <div className="flex items-center gap-2 flex-1">
              <Input
                id="cache_expiration"
                type="number"
                value={expirationTime}
                onChange={(e) => {
                  const value = parseInt(e.target.value);
                  if (!isNaN(value) && value > 0) {
                    updateExpiration(value);
                  }
                }}
                min={1}
                step={60}
                className="w-24"
              />
              <span className="text-xs text-muted-foreground">seconds</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
