/**
 * CodeBlock
 *
 * Styled code block with copy button for onboarding/setup pages.
 */

import { useState, useCallback } from "react";
import { cn } from "@/lib/utils";

interface CodeBlockProps {
  readonly children: React.ReactNode;
  readonly copyText?: string;
  readonly className?: string;
}

export function CodeBlock({ children, copyText, className }: CodeBlockProps) {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = useCallback(() => {
    if (!copyText) return;
    navigator.clipboard.writeText(copyText).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  }, [copyText]);

  return (
    <div className={cn(
      "relative bg-[#0c0c10] border border-border/30 rounded-lg p-4",
      "font-mono text-[12.5px] leading-[1.8] text-muted-foreground overflow-x-auto",
      className,
    )}>
      {copyText && (
        <button
          onClick={handleCopy}
          className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider bg-muted/50 text-muted-foreground/60 border border-border/30 hover:bg-muted hover:text-muted-foreground transition-all"
        >
          {isCopied ? "Copied" : "Copy"}
        </button>
      )}
      {children}
    </div>
  );
}

/** Inline syntax helpers for use inside CodeBlock children */
export function Cmd({ children }: { readonly children: React.ReactNode }) {
  return <span className="text-[rgb(var(--theme-400))]">{children}</span>;
}

export function Str({ children }: { readonly children: React.ReactNode }) {
  return <span className="text-pink-400">{children}</span>;
}

export function Comment({ children }: { readonly children: React.ReactNode }) {
  return <span className="text-muted-foreground/40">{children}</span>;
}

export function Output({ children }: { readonly children: React.ReactNode }) {
  return <span className="text-muted-foreground/40 italic">{children}</span>;
}
