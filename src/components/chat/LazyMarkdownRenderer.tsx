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

// Static component definitions - simple ones that don't need special logic
const staticComponents: Partial<Components> = {
  code: CodeComponent as Components['code'],
  pre: ({ children, ...props }) => (
    <pre
      {...props}
      className={`py-0 px-0 mx-0 my-0 whitespace-pre-wrap overflow-auto ${(props as any).className || ''}`}
    >
      {children}
    </pre>
  ),
  blockquote: ({ children, ...props }) => (
    <blockquote
      className="border-l-4 border-muted-foreground pl-4 italic text-muted-foreground my-2"
      {...props}
    >
      {children}
    </blockquote>
  ),
  h1: ({ children, ...props }) => (
    <h1 className="font-bold text-2xl pb-2 border-b border-border my-3" {...props}>
      {children}
    </h1>
  ),
  h2: ({ children, ...props }) => (
    <h2 className="font-bold text-xl pb-2 border-b border-border my-2" {...props}>
      {children}
    </h2>
  ),
  h3: ({ children, ...props }) => (
    <h3 className="font-bold text-lg my-2" {...props}>
      {children}
    </h3>
  ),
  h4: ({ children, ...props }) => (
    <h4 className="font-bold text-base my-1" {...props}>
      {children}
    </h4>
  ),
  h5: ({ children, ...props }) => (
    <h5 className="font-semibold text-sm my-1" {...props}>
      {children}
    </h5>
  ),
  h6: ({ children, ...props }) => (
    <h6 className="font-semibold text-xs my-1" {...props}>
      {children}
    </h6>
  ),
  ul: ({ children, ...props }) => (
    <ul {...props} className={`list-disc list-inside my-2 space-y-1 ${(props as any).className || ''}`}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol {...props} className={`list-decimal list-inside my-2 space-y-1 ${(props as any).className || ''}`}>
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li {...props} className={`my-0.5 ${(props as any).className || ''}`}>
      {children}
    </li>
  ),
  a: ({ children, ...props }) => (
    <a className="text-blue-500 hover:underline hover:text-blue-600" {...props}>
      {children}
    </a>
  ),
  table: ({ children, ...props }) => (
    <div className="overflow-x-auto my-2">
      <table className="min-w-full border-collapse" {...props}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }) => (
    <thead className="bg-secondary" {...props}>
      {children}
    </thead>
  ),
  tbody: ({ children, ...props }) => <tbody {...props}>{children}</tbody>,
  tr: ({ children, ...props }) => (
    <tr className="border-b border-border" {...props}>
      {children}
    </tr>
  ),
  td: ({ children, ...props }) => (
    <td className="px-3 py-2 border border-border" {...props}>
      {children}
    </td>
  ),
  th: ({ children, ...props }) => (
    <th className="px-3 py-2 border border-border font-semibold text-left" {...props}>
      {children}
    </th>
  ),
  img: (props) => {
    if (!(props as any).src) return null;
    return <img className="max-w-full rounded-lg my-2" {...props} />;
  },
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
