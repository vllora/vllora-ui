/**
 * CanvasToolbar
 *
 * Floating toolbar for the topic hierarchy canvas.
 * Provides controls like manual relayout, zoom, etc.
 */

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
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
      <Button
        variant="ghost"
        size="sm"
        onClick={handleRelayout}
        className="h-8 px-3 text-sm gap-2 rounded-full"
        title="Re-arrange nodes automatically"
      >
        <RefreshCw className="h-4 w-4" />
        Relayout
      </Button>
    </div>
  );
}
