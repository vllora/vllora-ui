/**
 * DatasetReadmeViewer
 *
 * Displays the auto-generated README for a dataset with options to
 * export as markdown file or copy to clipboard.
 *
 * Styled to match the Plan tab aesthetic.
 */

import { memo, useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Copy, Check, RefreshCw, FileText, Sparkles } from 'lucide-react';
import LazyMarkdownRenderer from '@/components/chat/LazyMarkdownRenderer';
import { cn } from '@/lib/utils';

interface DatasetReadmeViewerProps {
  /** The README markdown content */
  readme: string | null;
  /** Timestamp when README was last updated */
  readmeUpdatedAt: number | null;
  /** Callback to export README as file */
  onExport: () => void;
  /** Callback to regenerate README */
  onRegenerate: () => Promise<void>;
  /** Optional className for container */
  className?: string;
}

export const DatasetReadmeViewer = memo(function DatasetReadmeViewer({
  readme,
  readmeUpdatedAt,
  onExport,
  onRegenerate,
  className,
}: DatasetReadmeViewerProps) {
  const [copied, setCopied] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!readme) return;

    try {
      await navigator.clipboard.writeText(readme);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy README:', error);
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

  const formattedDate = readmeUpdatedAt
    ? new Date(readmeUpdatedAt).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  // Empty state - matches Plan tab empty state style
  if (!readme) {
    return (
      <div className={cn('flex-1 flex flex-col items-center justify-center p-8', className)}>
        <div className="flex flex-col items-center gap-6 max-w-md text-center">
          {/* Icon with gradient background */}
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[rgb(var(--theme-500))]/15 to-[rgb(var(--theme-500))]/5 flex items-center justify-center">
            <FileText className="w-6 h-6 text-[rgb(var(--theme-500))]" />
          </div>

          {/* Copy */}
          <div className="space-y-2">
            <h3 className="text-lg font-medium text-foreground">
              Dataset README
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              No README generated yet. Add records or configure your dataset
              to automatically generate documentation.
            </p>
          </div>

          {/* CTA */}
          <Button
            onClick={handleRegenerate}
            disabled={isRegenerating}
            className="gap-2 bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white"
          >
            {isRegenerating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Generate README
              </>
            )}
          </Button>

          {/* Helper text */}
          <p className="text-xs text-muted-foreground">
            README is auto-updated as you add data and configure your dataset
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Minimal header - matches Plan tab style */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/50">
        <div className="flex items-center gap-2 text-muted-foreground">
          <FileText className="w-4 h-4 text-[rgb(var(--theme-500))]" />
          <span className="text-xs font-medium">README</span>
          {formattedDate && (
            <span className="text-xs text-muted-foreground/60">
              · Updated {formattedDate}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
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
          <Button
            variant="ghost"
            size="sm"
            onClick={onExport}
            className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <Download className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Content - matches Plan tab markdown styling */}
      <div className="flex-1 overflow-auto">
        <div className="p-4 text-sm [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_table]:text-xs [&_p]:text-sm [&_li]:text-sm [&_blockquote]:text-sm">
          <LazyMarkdownRenderer content={readme} />
        </div>
      </div>
    </div>
  );
});
