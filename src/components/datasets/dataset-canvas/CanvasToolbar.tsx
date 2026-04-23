/**
 * CanvasToolbar
 *
 * Floating toolbar for the topic hierarchy canvas.
 * Relayout button to re-run dagre layout.
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
    if (onFitView) {
      setTimeout(onFitView, 100);
    }
  };

  return (
    <div
      className={cn(
        "absolute top-3 right-3 z-10",
        className
      )}
    >
      <TooltipProvider delayDuration={300}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              onClick={handleRelayout}
              className="h-8 w-8 bg-background/95 backdrop-blur-sm shadow-lg"
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
