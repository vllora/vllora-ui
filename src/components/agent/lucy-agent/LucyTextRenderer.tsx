/**
 * LucyTextRenderer
 *
 * Renders markdown text for Lucy chat messages using the shared MarkdownViewer.
 */

import { MarkdownViewer } from '@/components/chat/traces/TraceRow/span-info/DetailView/markdown-viewer';
import { cn } from '@/lib/utils';
import { memo } from 'react';

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

  return (
    <div className={cn('text-[13px]', className)}>
      <MarkdownViewer message={displayText} />
      {isStreaming && (
        <span className="inline-block w-2 h-4 bg-[rgb(var(--theme-500))] animate-pulse ml-0.5 rounded-sm" />
      )}
    </div>
  );
});

