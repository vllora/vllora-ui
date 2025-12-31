/**
 * LucyTextRenderer
 *
 * Renders markdown text with syntax highlighting for Lucy chat messages.
 */

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
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
    <div
      className={cn(
        'prose prose-sm dark:prose-invert max-w-none',
        'prose-p:mb-2 prose-p:last:mb-0',
        'prose-pre:bg-zinc-900 prose-pre:border prose-pre:border-zinc-700',
        'prose-code:text-emerald-400 prose-code:bg-zinc-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm',
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code: ({ className: codeClassName, children }) => {
            const match = /language-(\w+)/.exec(codeClassName || '');
            const language = match ? match[1] : '';
            const isInline = !match;

            if (!isInline && language) {
              return (
                <SyntaxHighlighter
                  style={oneDark}
                  language={language}
                  PreTag="div"
                  className="!mt-0 !mb-2 text-sm rounded-lg"
                  wrapLongLines
                >
                  {String(children).replace(/\n$/, '')}
                </SyntaxHighlighter>
              );
            }

            return (
              <code className="px-1 py-0.5 rounded text-sm font-mono bg-muted">
                {children}
              </code>
            );
          },
        }}
      >
        {text}
      </ReactMarkdown>
      {isStreaming && (
        <span className="inline-block w-2 h-4 bg-emerald-500 animate-pulse ml-0.5" />
      )}
    </div>
  );
}

export default LucyTextRenderer;
