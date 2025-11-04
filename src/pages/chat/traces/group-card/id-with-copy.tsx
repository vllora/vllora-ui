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

  const shortId = fullId.substring(0, 8);

  return (
    <span className="flex items-center gap-2">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={"flex items-center gap-1 text-xs w-[130px] font-mono  bg-muted px-1.5 py-0.5 rounded hover:bg-muted/80  transition-colors cursor-pointer " + (isCopied ? "text-green-500" : "text-muted-foreground hover:text-muted-foreground")}
              onClick={handleCopyId}
            >
              {isCopied ? "✓ Copied!" : `${label}: ${shortId}...`}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p className="text-xs">{isCopied ? "Copied to clipboard!" : "Click to copy full ID"}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <span className="text-muted-foreground/60">·</span>
      <span>{timeDisplay}</span>
    </span>
  );
};
