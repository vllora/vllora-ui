/**
 * DatasetReadmeViewer
 *
 * Displays the auto-generated README for a dataset with options to
 * export as markdown file or copy to clipboard.
 */

import { memo, useCallback, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, Copy, Check, RefreshCw, FileText } from 'lucide-react';
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

  if (!readme) {
    return (
      <Card className={cn('flex flex-col items-center justify-center py-12', className)}>
        <FileText className="w-12 h-12 text-muted-foreground/50 mb-4" />
        <p className="text-muted-foreground text-center mb-4">
          No README generated yet.
          <br />
          <span className="text-sm">
            Add records or configure your dataset to generate a README.
          </span>
        </p>
        <Button variant="outline" onClick={handleRegenerate} disabled={isRegenerating}>
          {isRegenerating ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4 mr-2" />
              Generate README
            </>
          )}
        </Button>
      </Card>
    );
  }

  return (
    <Card className={cn('flex flex-col h-full', className)}>
      <CardHeader className="flex-shrink-0 pb-3 border-b">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Dataset README</CardTitle>
            {formattedDate && (
              <p className="text-xs text-muted-foreground mt-1">
                Last updated: {formattedDate}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRegenerate}
              disabled={isRegenerating}
              className="h-8"
            >
              {isRegenerating ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              <span className="ml-2 hidden sm:inline">Refresh</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={handleCopy} className="h-8">
              {copied ? (
                <Check className="w-4 h-4 text-green-500" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
              <span className="ml-2 hidden sm:inline">{copied ? 'Copied!' : 'Copy'}</span>
            </Button>
            <Button variant="outline" size="sm" onClick={onExport} className="h-8">
              <Download className="w-4 h-4" />
              <span className="ml-2 hidden sm:inline">Export</span>
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto p-4">
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <LazyMarkdownRenderer content={readme} />
        </div>
      </CardContent>
    </Card>
  );
});
