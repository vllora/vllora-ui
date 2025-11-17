import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Database, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusBadge } from "./status-badge";

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
    <div className="space-y-1 py-2">
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
              <TooltipContent className="max-w-sm">
                <div className="space-y-2">
                  <p className="text-xs font-medium">Response Caching</p>
                  <p className="text-xs">Cache responses to identical prompts to:</p>
                  <ul className="text-xs list-disc pl-4 space-y-1">
                    <li>Reduce latency by serving cached responses instantly</li>
                    <li>Lower API costs by avoiding redundant model calls</li>
                    <li>Ensure consistent responses for the same inputs</li>
                  </ul>
                  <div className="pt-2 border-t border-border/50 space-y-1">
                    <p className="text-xs"><span className="font-medium">Type:</span> Exact Match - uses exact string matching for identical requests</p>
                    <p className="text-xs"><span className="font-medium">Expiration:</span> Cached responses automatically expire after the specified duration</p>
                  </div>
                  <p className="text-xs italic text-muted-foreground">Ideal for applications with repetitive queries</p>
                </div>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <StatusBadge active={cacheEnabled} />
        </div>
        <Switch
          id="cache_enabled"
          checked={cacheEnabled}
          onCheckedChange={toggleCache}
        />
      </div>

      {/* Cache Configuration - only shown when enabled */}
      {cacheEnabled && (
        <div className="ml-1 p-3 rounded-lg space-y-3">
          {/* Cache Type Badge */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Type:</span>
            <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 font-medium">
              Exact Match
            </span>
          </div>

          {/* Expiration Time Input */}
          <div className="space-y-1.5">
            <Label htmlFor="cache_expiration" className="text-xs font-medium text-muted-foreground">
              Expiration Time
            </Label>

            <div className="flex items-center gap-2">
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
                className="h-9 font-mono"
              />
              <span className="text-xs text-muted-foreground font-medium whitespace-nowrap">seconds</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
