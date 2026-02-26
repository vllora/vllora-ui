/**
 * CollapsibleCurlCommand
 *
 * Collapsible section displaying the example curl command for API initialization.
 * Provides copy functionality and expandable code view.
 */

import { useState } from "react";
import { Copy, ChevronDown, ChevronUp, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { CodeBlock } from "@/components/chat/traces/components/CodeBlock";

interface CollapsibleCurlCommandProps {
  command: string;
  className?: string;
  defaultExpanded?: boolean;
}

export function CollapsibleCurlCommand({
  command,
  className,
  defaultExpanded = false,
}: CollapsibleCurlCommandProps) {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const handleCopy = () => {
    navigator.clipboard.writeText(command);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card/50 backdrop-blur-sm overflow-hidden",
        className
      )}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsExpanded(!isExpanded)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setIsExpanded(!isExpanded); }}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            Example API Request
          </span>
          <span className="text-xs text-muted-foreground/60">
            POST /v1/chat/completions
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              handleCopy();
            }}
            className="h-7 gap-1.5 text-xs"
          >
            <Copy className="w-3.5 h-3.5" />
            {copied ? "Copied!" : "Copy"}
          </Button>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Collapsible Code Content */}
      <div
        className={cn(
          "overflow-hidden transition-all duration-300",
          isExpanded ? "max-h-[20vh]" : "max-h-0"
        )}
      >
        <div className="p-4 overflow-auto max-h-[20vh] bg-black/20 border-t border-border">
          <CodeBlock
            title=""
            code={command}
            language="bash"
            hideTitle
            showLineNumber={false}
          />
        </div>
      </div>
    </div>
  );
}
