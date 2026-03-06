/**
 * LucyTextRenderer
 *
 * Renders markdown text for Lucy chat messages using the shared MarkdownViewer.
 */

import { TextPreviewDialog } from '@/components/chat/messages/content-items';
import { MarkdownViewer } from '@/components/chat/traces/TraceRow/span-info/DetailView/markdown-viewer';
import { cn } from '@/lib/utils';
import { Expand } from 'lucide-react';
import { memo, useCallback, useRef, useState } from 'react';

// ============================================================================
// Constants
// ============================================================================

/** Max collapsed height in px before truncation + Expand button kicks in */
const MAX_COLLAPSED_HEIGHT = 300;

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
  const displayText = text || "No content available.";
  const contentRef = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showDialog, setShowDialog] = useState(false);

  // Check if content overflows on mount/update
  const measureRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    contentRef.current = node;
    setIsOverflowing(node.scrollHeight > MAX_COLLAPSED_HEIGHT);
  }, []);

  const isTruncated = isOverflowing && !isExpanded;

  return (
    <>
      <div className={cn('text-[13px] relative', className)}>
        <div
          ref={measureRef}
          className={cn(
            'overflow-hidden transition-[max-height] duration-300',
            isTruncated && 'max-h-[300px]'
          )}
        >
          <MarkdownViewer message={displayText} />
        </div>
        {/* Fade overlay when truncated */}
        {isTruncated && (
          <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-background/90 to-transparent pointer-events-none" />
        )}
        {/* Expand button — only shown when content overflows */}
        {isOverflowing && (
          <div className="flex justify-end mt-1">
            {isExpanded ? (
              <button
                onClick={() => setShowDialog(true)}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]
                  text-muted-foreground/70 hover:text-[rgb(var(--theme-600))]
                  hover:bg-[rgba(var(--theme-500),0.1)] transition-colors"
              >
                <Expand className="h-2.5 w-2.5" />
                Full view
              </button>
            ) : (
              <button
                onClick={() => setIsExpanded(true)}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]
                  text-muted-foreground/70 hover:text-[rgb(var(--theme-600))]
                  hover:bg-[rgba(var(--theme-500),0.1)] transition-colors"
              >
                <Expand className="h-2.5 w-2.5" />
                Expand
              </button>
            )}
          </div>
        )}
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

