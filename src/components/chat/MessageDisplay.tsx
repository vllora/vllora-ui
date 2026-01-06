import React, { useMemo, memo, lazy, Suspense } from 'react';

// Lazy load heavy markdown dependencies - only loaded when markdown content is detected
const LazyMarkdownRenderer = lazy(() => import('./LazyMarkdownRenderer'));
const LazyJsonViewer = lazy(() =>
  import('./traces/TraceRow/span-info/JsonViewer').then(mod => ({ default: mod.JsonViewer }))
);

// Regex to detect if content needs markdown parsing (has markdown syntax)
// This allows us to skip expensive parsing for plain text
// Made specific to avoid false positives (e.g., don't match standalone - or _)
const MARKDOWN_SYNTAX_REGEX = /\*\*|__|``|#{1,6}\s|^\s*[-*+]\s+\S|^\s*\d+\.\s+\S|\[.+\]\(.+\)|!\[|```|<[a-z][a-z0-9]*[\s>]|^\s*>/im;

interface MessageDisplayProps {
  message: string | any[];
}

// Fast check to avoid expensive JSON.parse on obvious non-JSON strings
const looksLikeJson = (str: string): boolean => {
  const firstChar = str.trimStart()[0];
  return firstChar === '{' || firstChar === '[';
};

const tryParseJson = (str: string): object | undefined => {
  // Skip JSON parsing for strings that clearly aren't JSON
  if (!looksLikeJson(str)) return undefined;
  try {
    const result = JSON.parse(str);
    return typeof result === 'object' ? result : undefined;
  } catch {
    return undefined;
  }
};

// Simple loading placeholder for markdown content
const MarkdownLoadingFallback = memo(({ content }: { content: string }) => (
  <p className="whitespace-pre-wrap my-1 text-muted-foreground">{content.slice(0, 200)}{content.length > 200 ? '...' : ''}</p>
));

// Simple loading placeholder for JSON content
const JsonLoadingFallback = memo(() => (
  <div className="animate-pulse bg-secondary/30 rounded h-20 w-full" />
));

export const MessageDisplay: React.FC<MessageDisplayProps> = memo(({ message }) => {
  return <BaseMessageDisplay message={message} />;
});

const BaseMessageDisplay: React.FC<{ message: string | any[] }> = memo(({ message }) => {
  // Memoize all computed values together for better performance
  const { parsedJsonMessage, markdownContent, needsMarkdown } = useMemo(() => {
    if (typeof message === 'string') {
      const parsedJson = tryParseJson(message);
      if (parsedJson) {
        return { parsedJsonMessage: parsedJson, markdownContent: '', needsMarkdown: false };
      }
      // Check if content has markdown syntax - skip expensive parsing for plain text
      const hasMarkdown = MARKDOWN_SYNTAX_REGEX.test(message);
      return { parsedJsonMessage: undefined, markdownContent: message, needsMarkdown: hasMarkdown };
    }
    const stringified = JSON.stringify(message);
    return { parsedJsonMessage: undefined, markdownContent: stringified, needsMarkdown: true };
  }, [message]);

  // Fast path: render JSON directly with lazy loading
  if (parsedJsonMessage) {
    return (
      <Suspense fallback={<JsonLoadingFallback />}>
        <LazyJsonViewer data={parsedJsonMessage} collapsed={3} />
      </Suspense>
    );
  }

  // Fast path: plain text without markdown syntax - skip ReactMarkdown entirely
  // This renders IMMEDIATELY without any lazy loading
  if (!needsMarkdown) {
    return <p className="whitespace-pre-wrap my-1">{markdownContent}</p>;
  }

  // Full markdown rendering - lazy loaded for content with markdown syntax
  return (
    <Suspense fallback={<MarkdownLoadingFallback content={markdownContent} />}>
      <LazyMarkdownRenderer content={markdownContent} />
    </Suspense>
  );
});
