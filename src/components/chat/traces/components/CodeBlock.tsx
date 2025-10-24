import React, { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { CheckCircle, Copy } from 'lucide-react';

interface CodeBlockProps {
  title: string;
  code: string;
  language?: string;
  hideTitle?: boolean;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({ title, code, language = 'bash', hideTitle = false }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if(hideTitle){
    return <div style={{
          fontSize: '0.75rem',
          lineHeight: '1.5',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          overflowWrap: 'anywhere',
        }}>
          <SyntaxHighlighter
            language={language}
            style={vscDarkPlus}
            customStyle={{
              margin: 0,
              padding: 0,
              background: 'transparent',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              overflowWrap: 'anywhere',
            }}
            codeTagProps={{
              style: {
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                overflowWrap: 'anywhere',
              }
            }}
            showLineNumbers={false}
          >
            {code}
          </SyntaxHighlighter>
        </div>
  }
  return (
    <div>
      {!hideTitle && <div className="flex items-center justify-between mb-3 pb-2 border-b border-border/50">
        <div className="text-sm font-semibold text-foreground">{title}</div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-all rounded-md border border-border/50 hover:border-border bg-background/50 hover:bg-muted/50"
          title={copied ? 'Copied!' : 'Copy to clipboard'}
        >
          {copied ? (
            <>
              <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5 text-muted-foreground" />
            </>
          )}
        </button>
      </div>}
      <div className="rounded-lg bg-black/40">
        <div style={{
          padding: '1rem',
          fontSize: '0.75rem',
          lineHeight: '1.5',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          overflowWrap: 'anywhere',
        }}>
          <SyntaxHighlighter
            language={language}
            style={vscDarkPlus}
            customStyle={{
              margin: 0,
              padding: 0,
              background: 'transparent',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              overflowWrap: 'anywhere',
            }}
            codeTagProps={{
              style: {
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                overflowWrap: 'anywhere',
              }
            }}
            showLineNumbers={false}
          >
            {code}
          </SyntaxHighlighter>
        </div>
      </div>
    </div>
  );
};
