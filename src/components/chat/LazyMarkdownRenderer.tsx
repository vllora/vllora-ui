import React, { memo, useMemo, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import type { Components } from 'react-markdown';

// Static plugin arrays - created once, never recreated
const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS: any[] = [rehypeRaw];

// Static style objects to prevent recreation
const CODE_BLOCK_STYLE = {
  margin: 0,
  borderRadius: '0.375rem',
  fontSize: '0.875rem',
};

const INLINE_CODE_STYLE: React.CSSProperties = {
  backgroundColor: 'rgba(0,0,0,0.3)',
  padding: '0.125rem 0.375rem',
  borderRadius: '0.25rem',
  fontSize: '0.875rem',
  fontFamily: 'ui-monospace, monospace',
};

// Code component for syntax highlighting - extracted and memoized
const CodeComponent = memo(({
  inline,
  className,
  children,
  ...props
}: {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
}) => {
  const match = /language-(\w+)/.exec(className || '');
  const codeString = String(children).replace(/\n$/, '');

  if (!inline && match) {
    return (
      <SyntaxHighlighter
        style={vscDarkPlus}
        language={match[1]}
        PreTag="div"
        customStyle={CODE_BLOCK_STYLE}
        {...props}
      >
        {codeString}
      </SyntaxHighlighter>
    );
  }

  return (
    <code className={className} style={INLINE_CODE_STYLE} {...props}>
      {children}
    </code>
  );
});

CodeComponent.displayName = 'CodeComponent';

// Static components object - only code needs special handling
const staticComponents: Partial<Components> = {
  code: CodeComponent as Components['code'],
};

interface LazyMarkdownRendererProps {
  content: string;
}

const LazyMarkdownRenderer: React.FC<LazyMarkdownRendererProps> = memo(({ content }) => {
  // Create paragraph component with memoized callback
  const createParagraphComponent = useCallback(
    ({ children }: { children?: React.ReactNode }) => (
      <p className="whitespace-pre-wrap my-1">{children}</p>
    ),
    []
  );

  // Memoize components object that includes dynamic paragraph
  const components = useMemo(
    () => ({
      ...staticComponents,
      p: createParagraphComponent,
    }),
    [createParagraphComponent]
  );

  return (
    <ReactMarkdown
      remarkPlugins={REMARK_PLUGINS}
      rehypePlugins={REHYPE_PLUGINS}
      components={components}
    >
      {content}
    </ReactMarkdown>
  );
});

LazyMarkdownRenderer.displayName = 'LazyMarkdownRenderer';

export default LazyMarkdownRenderer;
