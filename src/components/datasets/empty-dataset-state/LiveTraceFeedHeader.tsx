import { Circle } from "lucide-react";
import { cn } from "@/lib/utils";

interface LiveTraceFeedHeaderProps {
  isActive: boolean;
  onClear?: () => void;
}

export function LiveTraceFeedHeader({ isActive, onClear }: LiveTraceFeedHeaderProps) {
  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-border">
      <div className="flex items-center gap-2">
        <Circle className={cn(
          "w-2 h-2 fill-current",
          isActive ? "text-emerald-500 animate-pulse" : "text-muted-foreground"
        )} />
        <span className="text-sm font-medium">Live Trace Feed</span>
      </div>
      <div className="flex items-center gap-2">
        {onClear && (
          <button
            onClick={onClear}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear
          </button>
        )}
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-muted/50 text-xs text-muted-foreground">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          LISTENING
        </span>
      </div>
    </div>
  );
}
