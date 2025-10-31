import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize';
import behead from 'remark-behead';
import rehypeExternalLinks from 'rehype-external-links'
import remarkFlexibleParagraphs from "remark-flexible-paragraphs";
import { CheckIcon, ClipboardDocumentIcon } from "@heroicons/react/24/outline";
import { useCallback, useState } from "react";
import { JsonViewer } from '../JsonViewer';
import { tryParseJson } from '@/utils/modelUtils';
import { sanitizeSchema } from '@/utils/sanitizeSchema';

export const CopyToClipboard: React.FC<{ content: string } & React.HTMLAttributes<HTMLDivElement>> = ({ content, className, ...restProps }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  }, [content]);

  return (
    <div className={`items-center flex flex-row text-xs ${className}`} onClick={handleCopy} {...restProps}>
      {copied ? (
        <CheckIcon className="h-4 ml-2 text-green-500 animate-fadeIn" />
      ) : (
        <ClipboardDocumentIcon className="h-4 ml-2" />
      )}
    </div>
  );
};
export const MarkdownViewer: React.FC<{ message: string }> = ({ message }) => {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, behead, remarkFlexibleParagraphs]}
      rehypePlugins={[
        rehypeRaw,
        [rehypeSanitize, sanitizeSchema], // Sanitize after rehypeRaw to remove unknown tags
        [rehypeExternalLinks, { target: '_blank' }]
      ]}
      components={{
        code({ node, className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');
          return match ? (
            <div className="relative">
              <CopyToClipboard content={String(children).replace(/\n$/, '')} className="absolute top-0 right-0 m-2 p-1 rounded text-xs" />
              <div style={{ maxHeight: '400px', overflow: 'auto', overflowX: 'auto' }}>
                <SyntaxHighlighter
                  style={vscDarkPlus as any}
                  language={match[1]}
                  PreTag="div"
                  {...props}
                  ref={props.ref as React.LegacyRef<SyntaxHighlighter>}
                >
                  {String(children).replace(/\n$/, '')}
                </SyntaxHighlighter>
              </div>
            </div>
          ) : (
            <code className={className} {...props}>
              {children}
            </code>
          );
        },
        hr({ ...props }) {
          return <hr {...props} />
        },
        pre({ children, ...props }) {
          return <pre {...props} className={`py-0 px-0 mx-0 my-0 whitespace-pre-wrap overflow-auto ${props.className || ''}`}>{children}</pre>
        },
        blockquote({ children, ...props }) {
          return (
            <blockquote className="border-l-4 border-gray-300 pl-4 italic text-gray-600" {...props}>
              {children}
            </blockquote>
          );
        },
        h1({ children, ...props }) {
          return <h1 className="font-bold text-3xl pb-[0.3em] border-b border-border " {...props}>{children}</h1>
        },
        h2({ children, ...props }) {
          return <h2 className="font-bold text-2xl pb-[0.3em] border-b border-border" {...props}>{children}</h2>
        },
        h3({ children, ...props }) {
          return <h3 className="font-bold text-xl" {...props}>{children}</h3>
        },
        h4({ children, ...props }) {
          return <h4 className="font-bold text-lg " {...props}>{children}</h4>
        },
        h5({ children, ...props }) {
          return <h5 className="font-bold text-md " {...props}>{children}</h5>
        },
        h6({ children, ...props }) {
          return <h6 className="font-bold text-sm" {...props}>{children}</h6>
        },
        ul({ children, ...props }) {
          return <ul {...props} className={`list-disc list-inside my-1 ${props.className || ''}`}>{children}</ul>
        },
        ol({ children, ...props }) {
          return <ol {...props} className={`list-decimal list-inside my-1 ${props.className || ''}`}>{children}</ol>
        },

        li({ children, ...props }) {
          return <li {...props} className={`list-item my-0.5 ${props.className || ''}`}>{children}</li>
        },
        a({ children, ...props }) {
          return <a className="text-blue-500 hover:underline hover:text-blue-600" {...props}>{children}</a>
        },
        table({ children, ...props }) {
          return <table className="table-auto my-1 mx-1" {...props}>{children}</table>
        },
        tr({ children, ...props }) {
          return <tr className="table-row" {...props}>{children}</tr>
        },
        td({ children, ...props }) {
          return <td className="table-cell border border-border px-2 py-1" {...props}>{children}</td>
        },
        th({ children, ...props }) {
          return <th className="table-cell border border-border font-semibold text-blue-500 px-2 py-1" {...props}>{children}</th>
        },
        img({ children, ...props }) {
          if (props.src && props.width && props.height) {
            // Convert width and height to numbers and handle potential parsing errors
            const width = typeof props.width === 'string' ? parseInt(props.width, 10) : props.width;
            const height = typeof props.height === 'string' ? parseInt(props.height, 10) : props.height;

            return <img
              src={typeof props.src === 'string' ? props.src : ''}
              width={width}
              height={height}
              alt={props.alt || 'Image'}
              className={`${props.className || ''} object-contain`}
            />
          }
          return <img {...props} />
        },

        p({ children, ...props }) {
          // check if children is a string
          if (typeof children === 'string') {
            let stringChildren = children;
            let jsonObject = tryParseJson(stringChildren);
            if (Array.isArray(jsonObject) || typeof jsonObject === 'object') {
              return <JsonViewer data={jsonObject} />
            }
            return <p className="whitespace-pre-wrap my-0" {...props}>{children}</p>
          }
          return <p className="whitespace-pre-wrap my-0" {...props}>{children}</p>
        }

      }}
    >
      {message}
    </ReactMarkdown>
  );
};