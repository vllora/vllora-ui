import React from "react";
import { cn } from "@/lib/utils";
import { MousePointerClickIcon } from "lucide-react";
import { ChatWindowConsumer } from "@/contexts/ChatWindowContext";
import { SpanInfo } from "../TraceRow/span-info";

interface SpanDetailsPanelProps {
  className?: string;
}

export const SpanDetailsPanel: React.FC<SpanDetailsPanelProps> = ({
  className,
}) => {
  const { detailSpan } = ChatWindowConsumer();

  console.log('===== detailSpan', detailSpan)
  return (
    <div className={cn("flex flex-col h-full w-full", className)}>
      <div className="flex-1 overflow-hidden bg-[#0f0f0f] h-full">
        { detailSpan ? (
            <div className="h-full w-full overflow-hidden">
              <SpanInfo />
            </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full p-4 text-center space-y-3">
            <div className="p-3 bg-[#151515] rounded-full">
              <MousePointerClickIcon className="h-5 w-5 text-blue-500" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-medium text-white">No span selected</h3>
              <p className="text-xs text-gray-400 max-w-[250px] mx-auto">
                Click on any span in the list to see detailed information
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
