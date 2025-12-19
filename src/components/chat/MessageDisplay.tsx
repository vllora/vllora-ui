import React, { useMemo, memo } from 'react';
import ReactMarkdown, { Components } from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import rehypeExternalLinks from 'rehype-external-links';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import behead from 'remark-behead';
import remarkGfm from 'remark-gfm';
import remarkFlexibleParagraphs from 'remark-flexible-paragraphs';
import { sanitizeSchema } from '@/utils/sanitizeSchema';
import { JsonViewer } from './traces/TraceRow/span-info/JsonViewer';

// Regex to detect if content needs markdown parsing (has markdown syntax)
// This allows us to skip expensive parsing for plain text
const MARKDOWN_SYNTAX_REGEX = /[*_`#\[\]!|>~\\-]|^\s*[-*+]\s|^\s*\d+\.\s|```|<[a-z]/im;

interface MessageDisplayProps {
  message: string | any[];
}

const tryParseJson = (str: string): object | undefined => {
  try {
    const result = JSON.parse(str);
    return typeof result === 'object' ? result : undefined;
  } catch {
    return undefined;
  }
};

// Static plugin arrays - defined outside component to avoid recreation
const REMARK_PLUGINS = [remarkGfm, behead, remarkFlexibleParagraphs];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const REHYPE_PLUGINS: any[] = [
  rehypeRaw,
  [rehypeSanitize, sanitizeSchema],
  [rehypeExternalLinks, { target: '_blank' }]
];

// Static style objects
const CODE_BLOCK_STYLE_JSON = { overflow: 'auto', overflowX: 'auto' } as const;
const CODE_BLOCK_STYLE_DEFAULT = { maxHeight: '400px', overflow: 'auto', overflowX: 'auto' } as const;
const SYNTAX_HIGHLIGHTER_STYLE = { wordWrap: 'break-word', whiteSpace: 'pre-wrap', margin: 0 } as const;

// Language regex - compiled once
const LANGUAGE_REGEX = /language-(\w+)/;

// Code component - extracted for clarity
const CodeComponent: Components['code'] = ({ className, children, ...props }) => {
  const match = LANGUAGE_REGEX.exec(className || '');

  if (!match) {
    return (
      <code
        className="bg-secondary/50 px-1 py-0.5 rounded text-xs font-mono"
        {...props}
      >
        {children}
      </code>
    );
  }

  const language = match[1].toLowerCase();
  const isJsonLanguage = language.includes('json');
  const codeContent = String(children).replace(/\n$/, '');
  const parsedJson = isJsonLanguage ? tryParseJson(codeContent) : undefined;

  return (
    <div className="relative my-2">
      <div style={parsedJson ? CODE_BLOCK_STYLE_JSON : CODE_BLOCK_STYLE_DEFAULT}>
        {parsedJson ? (
          <div className="px-3 py-2">
            <JsonViewer data={parsedJson} collapsed={10} />
          </div>
        ) : (
          <SyntaxHighlighter
            style={vscDarkPlus as any}
            language={match[1]}
            PreTag="div"
            customStyle={SYNTAX_HIGHLIGHTER_STYLE}
          >
            {codeContent}
          </SyntaxHighlighter>
        )}
      </div>
    </div>
  );
};

// Paragraph component - extracted and memoized reference needed
const createParagraphComponent = (BaseComponent: React.FC<{ message: string | any[] }>): Components['p'] => {
  return ({ children, ...props }) => {
    if (typeof children === 'string') {
      const jsonObject = tryParseJson(children);
      if (jsonObject && Object.keys(jsonObject).length > 0) {
        return (
          <BaseComponent
            message={`\`\`\`json\n${JSON.stringify(jsonObject, null, 2)}`}
          />
        );
      }
    }
    return (
      <p className="whitespace-pre-wrap my-1" {...props}>
        {children}
      </p>
    );
  };
};

// Static component definitions - simple ones that don't need special logic
const staticComponents: Partial<Components> = {
  pre: ({ children, ...props }) => (
    <pre
      {...props}
      className={`py-0 px-0 mx-0 my-0 whitespace-pre-wrap overflow-auto ${props.className || ''}`}
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
    <ul {...props} className={`list-disc list-inside my-2 space-y-1 ${props.className || ''}`}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }) => (
    <ol {...props} className={`list-decimal list-inside my-2 space-y-1 ${props.className || ''}`}>
      {children}
    </ol>
  ),
  li: ({ children, ...props }) => (
    <li {...props} className={`my-0.5 ${props.className || ''}`}>
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
    if (!props.src) return null;
    return <img className="max-w-full rounded-lg my-2" {...props} />;
  },
};

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

  // Memoize components object with paragraph component that references this component
  const components = useMemo<Components>(() => ({
    ...staticComponents,
    code: CodeComponent,
    p: createParagraphComponent(BaseMessageDisplay),
  }), []);

  // Fast path: render JSON directly
  if (parsedJsonMessage) {
    return <JsonViewer data={parsedJsonMessage} collapsed={10} />;
  }

  // Fast path: plain text without markdown syntax - skip ReactMarkdown entirely
  if (!needsMarkdown) {
    return <p className="whitespace-pre-wrap my-1">{markdownContent}</p>;
  }

  // Full markdown rendering for content with markdown syntax
  return (
    <ReactMarkdown
      remarkPlugins={REMARK_PLUGINS}
      rehypePlugins={REHYPE_PLUGINS}
      components={components}
    >
      {markdownContent}
    </ReactMarkdown>
  );
});