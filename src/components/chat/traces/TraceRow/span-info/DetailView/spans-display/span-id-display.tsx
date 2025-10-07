import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CheckIcon, ClipboardDocumentIcon } from "@heroicons/react/24/outline";
import { HashIcon } from "lucide-react";
import { useState } from "react";


interface IdDisplayProps {
  id: string;
  type: 'span' | 'trace' | 'thread' | 'run' | string;
  className?: string;
}

export const CopyTextButton = (props: {
  text: string;
  tooltipText?: string;
}) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(props.text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 hover:bg-[#1a1a1a] hover:text-teal-500"
            onClick={handleCopy}
          >
            {copied ? (
              <CheckIcon className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <ClipboardDocumentIcon className="h-3.5 w-3.5" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">
          <p className="text-xs">{props.tooltipText || 'Click to copy'}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export const IdDisplay = ({ id, type, className = "" }: IdDisplayProps) => {
  const displayType = type.charAt(0).toUpperCase() + type.slice(1);
  return (
    <div className={`flex items-center justify-between px-3 py-2 border-b border-border ${className}`}>
      <div className="flex items-center gap-2">
        <HashIcon className="h-3.5 w-3.5 text-white" />
        <span className="text-xs text-white w-[65px]">{displayType} ID:</span>
        <span className="text-xs bg-[#1a1a1a] px-2 py-0.5 rounded text-teal-500">
          {id}
        </span>

      </div>
      <div className="flex items-center gap-2">
        <CopyTextButton text={id} tooltipText={`Copy ${displayType} ID`} />
      </div>
    </div>
  );
};
