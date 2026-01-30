/**
 * SpanIdCell
 *
 * Cell component displaying a truncated span ID with copy functionality.
 */

import { useState } from "react";
import { Copy, Check } from "lucide-react";

export interface SpanIdCellProps {
  spanId: string;
}

/**
 * SpanId cell with truncated display and copy functionality
 */
export function SpanIdCell({ spanId }: SpanIdCellProps) {
  const [copied, setCopied] = useState(false);

  const truncatedId = spanId.length > 8
    ? `${spanId.slice(0, 4)}...${spanId.slice(-4)}`
    : spanId;

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(spanId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50 hover:bg-muted text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
      title={`Click to copy: ${spanId}`}
    >
      {truncatedId}
      {copied ? (
        <Check className="w-3 h-3 text-emerald-500" />
      ) : (
        <Copy className="w-3 h-3" />
      )}
    </button>
  );
}
