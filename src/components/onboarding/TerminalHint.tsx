/**
 * TerminalHint
 *
 * Compact terminal command hint with a monospace code block.
 * Used in empty states to show the CLI command users should run.
 */

import { Terminal } from "lucide-react";
import { cn } from "@/lib/utils";

interface TerminalHintProps {
  readonly command: string;
  readonly highlight?: string;
  readonly className?: string;
}

export function TerminalHint({ command, highlight, className }: TerminalHintProps) {
  const parts = highlight ? command.split(highlight) : [command];

  return (
    <div className={cn(
      "inline-flex items-center gap-2.5 px-4 py-2.5 rounded-lg",
      "bg-[#0c0c10] border border-border/30",
      className,
    )}>
      <div className="w-7 h-7 rounded-md bg-muted/50 flex items-center justify-center shrink-0">
        <Terminal className="w-3.5 h-3.5 text-muted-foreground/60" />
      </div>
      <code className="text-[12.5px] font-mono text-muted-foreground">
        {highlight && parts.length > 1 ? (
          <>
            {parts[0]}
            <span className="text-[rgb(var(--theme-400))]">{highlight}</span>
            {parts[1]}
          </>
        ) : (
          command
        )}
      </code>
    </div>
  );
}
