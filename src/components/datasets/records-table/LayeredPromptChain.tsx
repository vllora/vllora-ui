/**
 * LayeredPromptChain
 *
 * Vertical stacked rendering of the prompt-inheritance chain. Adapted from
 * the Workflow Redesign mock — each layer is a numbered row with the layer
 * kicker, a one-line label, and the actual prompt text. The leaf layer is
 * highlighted with the brand accent so it's obvious which layer applies on
 * "this page". Used by `TopicDetailView` in place of `SimplePromptChain` —
 * the horizontal version is preserved for `PromptInheritancePanel`.
 */

import { useState } from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { PromptChainLink } from "./PromptChainCard";

interface LayeredPromptChainProps {
  chain: readonly PromptChainLink[];
  className?: string;
  /** When true, omit the built-in card header (caller owns titling). */
  hideHeader?: boolean;
}

const LEVEL_KICKER: Record<PromptChainLink["level"], string> = {
  root: "Workspace · root",
  parent: "Topic · ancestor",
  leaf: "Topic · this page",
};

const PREVIEW_CHARS = 220;

export function LayeredPromptChain({ chain, className, hideHeader }: LayeredPromptChainProps) {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  if (chain.length === 0) return null;

  const toggle = (i: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <TooltipProvider delayDuration={250}>
      <div className={cn("rounded-lg border border-border bg-zinc-900/30 overflow-hidden", className)}>
        {!hideHeader && (
          <div className="px-4 py-2 border-b border-border flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/70">
              System prompt chain
            </span>
            <span className="text-[10px] text-muted-foreground/60">
              · {chain.length} layer{chain.length === 1 ? "" : "s"} merged at generation time
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="w-3 h-3 text-muted-foreground/50 cursor-help" />
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-[280px]">
                <p className="text-xs">
                  Inherited top-down: the workspace root prompt, then any ancestor topics, then the
                  current leaf topic. The merged prompt is what the model sees when generating records
                  for this topic.
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
        )}

        <div className="divide-y divide-border/50">
          {chain.map((link, i) => {
            const isLeaf = link.level === "leaf";
            const isExpanded = expanded.has(i);
            const truncated = link.prompt.length > PREVIEW_CHARS;
            const text = isExpanded || !truncated ? link.prompt : `${link.prompt.slice(0, PREVIEW_CHARS).trim()}…`;
            return (
              <div
                key={i}
                className={cn(
                  "grid items-start gap-3 px-4 py-2.5",
                  isLeaf && "bg-emerald-500/[0.04]",
                )}
                style={{ gridTemplateColumns: "22px 1fr auto" }}
              >
                <span
                  className={cn(
                    "inline-flex items-center justify-center w-[18px] h-[18px] rounded text-[10px] font-semibold tabular-nums mt-0.5",
                    isLeaf
                      ? "bg-emerald-400 text-zinc-950"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={cn(
                        "text-[10px] font-semibold uppercase tracking-wider",
                        isLeaf ? "text-emerald-300" : "text-muted-foreground/70",
                      )}
                    >
                      {LEVEL_KICKER[link.level]}
                    </span>
                    <span className="text-[11px] text-muted-foreground truncate">
                      {link.label}
                    </span>
                    {isLeaf && (
                      <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-semibold">
                        active
                      </span>
                    )}
                  </div>
                  <p
                    className={cn(
                      "text-[11.5px] leading-relaxed font-mono whitespace-pre-wrap break-words",
                      isLeaf ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {text}
                  </p>
                </div>
                {truncated && (
                  <button
                    type="button"
                    onClick={() => toggle(i)}
                    className="text-[10px] text-muted-foreground/70 hover:text-foreground transition-colors mt-1"
                  >
                    {isExpanded ? "Show less" : "Show all"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}
