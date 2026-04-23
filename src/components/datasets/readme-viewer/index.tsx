/**
 * DatasetReadmeViewer
 *
 * Displays the auto-generated README for a dataset with options to
 * export as markdown file or copy to clipboard.
 *
 * Styled to match the Plan tab aesthetic.
 */

import { memo } from 'react';
import { FileText } from 'lucide-react';
import LazyMarkdownRenderer from '@/components/chat/LazyMarkdownRenderer';
import { cn } from '@/lib/utils';
import { ReadmeEmptyState } from './ReadmeEmptyState';
import { ReadmeHeaderActions } from './ReadmeHeaderActions';

interface DatasetReadmeViewerProps {
  /** The README markdown content */
  readme: string | null;
  /** Timestamp when README was last updated */
  readmeUpdatedAt: number | null;
  /** Callback to export README as file */
  onExport: () => void;
  /** Optional header label (defaults to "Overview") */
  headerLabel?: string;
  /** Optional className for container */
  className?: string;
}

export const DatasetReadmeViewer = memo(function DatasetReadmeViewer({
  readme,
  readmeUpdatedAt,
  onExport,
  headerLabel = "Overview",
  className,
}: DatasetReadmeViewerProps) {
  const formattedDate = readmeUpdatedAt
    ? new Date(readmeUpdatedAt).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  // Empty state
  if (!readme) {
    return <ReadmeEmptyState className={className} />;
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Minimal header - matches Plan tab style */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/50">
        <div className="flex items-center gap-2 text-muted-foreground">
          <FileText className="w-4 h-4 text-[rgb(var(--theme-500))]" />
          <span className="text-xs font-medium">{headerLabel}</span>
          {formattedDate && (
            <span className="text-xs text-muted-foreground/60">
              · Updated {formattedDate}
            </span>
          )}
        </div>
        <ReadmeHeaderActions
          readme={readme}
          onExport={onExport}
        />
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

// Re-export sub-components
export { ReadmeEmptyState } from './ReadmeEmptyState';
export { ReadmeHeaderActions } from './ReadmeHeaderActions';
