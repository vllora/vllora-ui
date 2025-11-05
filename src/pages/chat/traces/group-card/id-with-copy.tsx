import React, { useState, useCallback } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface IdWithCopyProps {
  label: string;
  fullId: string;
  timeDisplay: string;
}

export const IdWithCopy: React.FC<IdWithCopyProps> = ({ label, fullId, timeDisplay }) => {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopyId = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(fullId);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  }, [fullId]);

  return (
    <span className="flex items-center gap-4">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={"flex items-center font-normal gap-1 text-xs w-[130px] font-mono bg-muted px-1.5 py-0.5 rounded hover:bg-muted/80 transition-colors cursor-pointer " + (isCopied ? "text-green-500" : "text-zinc-300 hover:text-muted-foreground")}
              onClick={handleCopyId}
            >
              <span className="truncate">{isCopied ? "✓ Copied!" : `${label}: ${fullId}`}</span>
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">{isCopied ? "Copied to clipboard!" : "Click to copy full ID"}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <span>{timeDisplay}</span>
    </span>
  );
};
