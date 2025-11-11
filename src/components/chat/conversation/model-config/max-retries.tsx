import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Info } from "lucide-react";

interface MaxRetriesConfigProps {
  config: Record<string, any>;
  onConfigChange: (config: Record<string, any>) => void;
}

export function MaxRetriesConfig({
  config,
  onConfigChange,
}: MaxRetriesConfigProps) {
  const maxRetries = config.max_retries as number | undefined;

  const handleChange = (value: string) => {
    const numValue = value === "" ? undefined : parseInt(value);
    const newConfig = { ...config };

    if (numValue === undefined || isNaN(numValue)) {
      delete newConfig.max_retries;
    } else {
      newConfig.max_retries = numValue;
    }

    onConfigChange(newConfig);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="max_retries" className="text-sm font-semibold">
            Max Retries
          </Label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-xs">Maximum number of retry attempts if the request fails</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Input
          id="max_retries"
          type="number"
          value={maxRetries ?? ""}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="Default: 0"
          min={0}
          max={10}
          className="max-w-[200px]"
        />
        <span className="text-xs text-muted-foreground">(0-10)</span>
      </div>
    </div>
  );
}
