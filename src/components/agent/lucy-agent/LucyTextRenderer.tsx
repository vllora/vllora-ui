/**
 * LucyTextRenderer
 *
 * Renders markdown text for Lucy chat messages using the shared MarkdownViewer.
 */

import { TextPreviewDialog } from '@/components/chat/messages/content-items';
import { MarkdownViewer } from '@/components/chat/traces/TraceRow/span-info/DetailView/markdown-viewer';
import { cn } from '@/lib/utils';
import { Expand } from 'lucide-react';
import { memo, useState } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface LucyTextRendererProps {
  text: string;
  isStreaming?: boolean;
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

export const LucyTextRenderer = memo(({ text, isStreaming, className }: LucyTextRendererProps) => {
  const [showDialog, setShowDialog] = useState(false);
        const displayText = text || "No content available.";

  return (
    <>
      <div className={cn('text-sm', className)}>
        {/* <TextContent content={text} /> */}
        <MarkdownViewer message={displayText} />
        <div className="flex justify-end mt-2">
          <button
            onClick={() => setShowDialog(true)}
            aria-label="View full content"
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]
              text-muted-foreground/70 hover:text-[rgb(var(--theme-600))]
              hover:bg-[rgb(var(--theme-500))]/10
              transition-colors"
          >
            <Expand className="h-2.5 w-2.5" />
            Expand
          </button>
        </div>
        {isStreaming && (
          <span className="inline-block w-2 h-4 bg-[rgb(var(--theme-500))] animate-pulse ml-0.5 rounded-sm" />
        )}
      </div>
      <TextPreviewDialog
        content={showDialog ? text : null}
        onClose={() => setShowDialog(false)}
      />
    </>
  );
});

