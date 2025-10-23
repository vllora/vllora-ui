import { useState } from 'react';
import { CheckCircle, Copy } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export const ThreadCopiableId = ({ id }: { id: string }) => {
  const [copied, setCopied] = useState(false);
  
  if (!id) {
    return null;
  }
  
  const handleCopy = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  // Display first and last 3 characters of the ID
  const start3 = id.substring(0, 3);
  const end3 = id.substring(id.length - 3);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-secondary/20 hover:bg-secondary/30 transition-colors cursor-pointer"
            onClick={handleCopy}
          >
            <span className="text-xs font-mono text-muted-foreground">
              {start3}...{end3}
            </span>
            <div>
              {copied ? (
                <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          <p>Click to copy full thread ID</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
