import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ArrowTopRightOnSquareIcon, CheckIcon, ClipboardDocumentIcon, FunnelIcon } from "@heroicons/react/24/outline";
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
  const isInThreadsUrl = true// pathname === `/projects/${params?.projectId}/threads`;

  // Helper function to build filter URL while preserving existing filters
  const buildFilterUrl = (filterType: 'traceIds' | 'threadIds' | 'runIds', value: string) => {
    // const currentParams = new URLSearchParams(searchParams?.toString());

    // // Get existing values for this filter type
    // const existingValues = currentParams.get(filterType)?.split(',').filter(v => v.trim() !== '') || [];

    // // Add the new value if not already present
    // if (!existingValues.includes(value)) {
    //   existingValues.push(value);
    // }

    // // Update the URL parameter
    // currentParams.set(filterType, existingValues.join(','));

    return ''  //`/projects/${projectId}/traces?${currentParams.toString()}`;
  };
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
        {type.toLowerCase() === 'trace' && <TooltipProvider><Tooltip>
          <TooltipTrigger asChild>
            <a href={buildFilterUrl('traceIds', id)} >
              <FunnelIcon className="h-3.5 w-3.5 cursor-pointer hover:text-teal-500" />
            </a>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="text-xs">Click to filter by this trace</p>
          </TooltipContent>
        </Tooltip></TooltipProvider>}
        {type.toLowerCase() === 'thread' && <TooltipProvider><Tooltip>
          <TooltipTrigger asChild>
            <a href={buildFilterUrl('threadIds', id)} >
              <FunnelIcon className="h-3.5 w-3.5 cursor-pointer hover:text-teal-500" />
            </a>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="text-xs">Click to filter by this thread</p>
          </TooltipContent>
        </Tooltip></TooltipProvider>}
        {type.toLowerCase() === 'run' && <TooltipProvider><Tooltip>
          <TooltipTrigger asChild>
            <a href={buildFilterUrl('runIds', id)} >
              <FunnelIcon className="h-3.5 w-3.5 cursor-pointer hover:text-teal-500" />
            </a>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="text-xs">Click to filter by this run</p>
          </TooltipContent>
        </Tooltip></TooltipProvider>}
        {type.toLowerCase() === 'thread' && !isInThreadsUrl && <TooltipProvider><Tooltip>
          <TooltipTrigger asChild>
            <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5 cursor-pointer hover:text-teal-500" />

          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p className="text-xs">Click to view this thread</p>
          </TooltipContent>
        </Tooltip></TooltipProvider>}
        <CopyTextButton text={id} tooltipText={`Copy ${displayType} ID`} />
      </div>
    </div>
  );
};
