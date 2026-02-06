/**
 * CanvasToolbar
 *
 * Floating toolbar for the topic hierarchy canvas.
 * Provides controls like manual relayout, zoom, etc.
 */

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { TopicCanvasConsumer } from "./TopicCanvasContext";
import { cn } from "@/lib/utils";

interface CanvasToolbarProps {
  className?: string;
  onFitView?: () => void;
}

export function CanvasToolbar({ className, onFitView }: CanvasToolbarProps) {
  const { triggerRelayout } = TopicCanvasConsumer();

  const handleRelayout = () => {
    triggerRelayout();
    // Also fit view after relayout
    if (onFitView) {
      setTimeout(onFitView, 100);
    }
  };

  return (
    <div
      className={cn(
        "absolute bottom-4 right-4 z-10",
        "flex items-center gap-1 px-1.5 py-1",
        "bg-background/95 backdrop-blur-sm",
        "border border-border rounded-full shadow-lg",
        className
      )}
    >
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRelayout}
              className="h-8 w-8 rounded-full"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Relayout</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
