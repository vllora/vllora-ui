/**
 * ReadmeHeaderActions
 *
 * Action buttons for the README header: copy, export, and regenerate (via Lucy).
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
import { emitter } from '@/utils/eventEmitter';

interface ReadmeHeaderActionsProps {
  readme: string;
  onExport: () => void;
}

export function ReadmeHeaderActions({
  readme,
  onExport,
}: ReadmeHeaderActionsProps) {
  const [copied, setCopied] = useState(false);

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

  const handleRegenerate = useCallback(() => {
    emitter.emit('vllora_lucy_prompt', {
      prompt: 'Please write or update the README for this dataset based on its current state.',
    });
  }, []);

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex items-center gap-1">
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

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRegenerate}
              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Ask Lucy to rewrite</p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}
