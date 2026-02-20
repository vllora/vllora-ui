/**
 * ReadmeHeaderActions
 *
 * Action buttons for the README header: refresh, copy, and export.
 */

import { useState, useCallback } from 'react';
import { Download, Copy, Check, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface ReadmeHeaderActionsProps {
  readme: string;
  onRegenerate: () => Promise<void>;
  onExport: () => void;
}

export function ReadmeHeaderActions({
  readme,
  onRegenerate,
  onExport,
}: ReadmeHeaderActionsProps) {
  const [copied, setCopied] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!readme) return;

    try {
      await navigator.clipboard.writeText(readme);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy overview:', error);
    }
  }, [readme]);

  const handleRegenerate = useCallback(async () => {
    setIsRegenerating(true);
    try {
      await onRegenerate();
    } finally {
      setIsRegenerating(false);
    }
  }, [onRegenerate]);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRegenerate}
              disabled={isRegenerating}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              {isRegenerating ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Regenerate Overview</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-green-500" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>{copied ? 'Copied!' : 'Copy to clipboard'}</p>
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={onExport}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <Download className="w-3.5 h-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Export as file</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
