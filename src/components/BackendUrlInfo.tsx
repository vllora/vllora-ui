import { useState } from 'react';
import { Info, Copy, Check, Link2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import { getBackendUrl } from '@/config/api';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

export function BackendUrlInfo() {
  const [copied, setCopied] = useState(false);
  const backendUrl = `${getBackendUrl()}/v1`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(backendUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <Dialog>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <button
                className="flex items-center justify-center w-8 h-8 rounded-md bg-muted/20 border border-border hover:bg-muted/40 hover:border-border/50 transition-all duration-200 hover:scale-105 active:scale-95"
                aria-label="Base URL Information"
              >
                <Info className="w-4 h-4 text-muted-foreground" />
              </button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>Base URL Info</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-[rgb(var(--theme-500))]/10">
              <Link2 className="w-5 h-5 text-[rgb(var(--theme-500))]" />
            </div>
            <DialogTitle className="text-xl">Base URL</DialogTitle>
          </div>
          <DialogDescription className="text-base">
            Use this URL to connect your application to the API
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-4">
          <div className="group relative">
            <div className="flex items-center gap-2 bg-muted/30 hover:bg-muted/40 px-4 py-3 rounded-lg transition-colors border border-transparent hover:border-border/50">
              <code className="flex-1 text-sm font-mono text-foreground break-all select-all">
                {backendUrl}
              </code>
              <button
                onClick={handleCopy}
                className="flex items-center justify-center min-w-[32px] h-8 rounded-md hover:bg-background/80 transition-all duration-200 active:scale-95"
                aria-label={copied ? 'Copied' : 'Copy to clipboard'}
              >
                {copied ? (
                  <div className="flex items-center gap-1.5 text-green-500 animate-in fade-in zoom-in duration-200">
                    <Check className="w-4 h-4" />
                    <span className="text-xs font-medium">Copied!</span>
                  </div>
                ) : (
                  <Copy className="w-4 h-4 text-muted-foreground hover:text-foreground transition-colors" />
                )}
              </button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground px-1">
            Click the URL to select all, or use the copy button
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
