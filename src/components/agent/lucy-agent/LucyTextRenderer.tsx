/**
 * LucyTextRenderer
 *
 * Renders markdown text for Lucy chat messages using the shared MarkdownViewer.
 */

import { MarkdownViewer } from '@/components/chat/traces/TraceRow/span-info/DetailView/markdown-viewer';
import { cn } from '@/lib/utils';

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

export function LucyTextRenderer({ text, isStreaming, className }: LucyTextRendererProps) {
  return (
    <div className={cn('text-sm', className)}>
      <MarkdownViewer message={text} />
      {isStreaming && (
        <span className="inline-block w-2 h-4 bg-emerald-500 animate-pulse ml-0.5" />
      )}
    </div>
  );
}

export default LucyTextRenderer;
