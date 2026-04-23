/**
 * PromptChainCard
 *
 * Single card in a prompt chain (Root → Parent → Leaf).
 * Shows label, truncated prompt text with tooltip on hover, and expand/collapse.
 * Shared between PromptInheritancePanel (All Topics) and PromptChainPanel (leaf topics).
 */

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface PromptChainLink {
  readonly label: string;
  readonly level: "root" | "parent" | "leaf";
  readonly prompt: string;
}

interface PromptChainCardProps {
  readonly link: PromptChainLink;
  readonly isExpanded?: boolean;
  readonly onToggleExpand?: () => void;
}

export function PromptChainCard({ link, isExpanded = false, onToggleExpand }: PromptChainCardProps) {
  const isLeaf = link.level === "leaf";
  const showTooltip = !isExpanded && link.prompt.length > 0;

  return (
    <div className={cn(
      "flex flex-col min-w-[180px] max-w-[280px] rounded-lg border p-2.5",
      isLeaf
        ? "border-[rgba(var(--theme-500),0.3)] bg-[rgba(var(--theme-500),0.05)]"
        : "border-border/50 bg-muted/30",
    )}>
      {/* Label + expand toggle */}
      <div className="flex items-center justify-between mb-1">
        <span className={cn(
          "text-[9px] font-semibold uppercase tracking-wider",
          isLeaf ? "text-[rgb(var(--theme-500))]" : "text-muted-foreground/60",
        )}>
          {link.label}
        </span>
        {link.prompt.length > 120 && onToggleExpand && (
          <button
            type="button"
            onClick={onToggleExpand}
            className="p-0.5 rounded hover:bg-muted/50 text-muted-foreground/50"
          >
            {isExpanded
              ? <ChevronUp className="w-3 h-3" />
              : <ChevronDown className="w-3 h-3" />}
          </button>
        )}
      </div>

      {/* Prompt text — always show tooltip when collapsed */}
      {showTooltip ? (
        <TooltipProvider delayDuration={300}>
          <Tooltip>
            <TooltipTrigger asChild>
              <p className="text-[11px] text-muted-foreground font-mono leading-relaxed whitespace-pre-wrap line-clamp-3 cursor-help">
                {link.prompt}
              </p>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[400px] max-h-[300px] overflow-y-auto p-3">
              <p className="text-xs font-mono leading-relaxed whitespace-pre-wrap">
                {link.prompt}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        <p className="text-[11px] text-muted-foreground font-mono leading-relaxed whitespace-pre-wrap">
          {link.prompt || "(empty)"}
        </p>
      )}
    </div>
  );
}

/**
 * SimplePromptChain
 *
 * Renders a horizontal chain of PromptChainCards with chevron arrows.
 * Used by both PromptInheritancePanel and TopicDetailView.
 */

import { ChevronRight } from "lucide-react";

interface SimplePromptChainProps {
  readonly chain: readonly PromptChainLink[];
  readonly className?: string;
}

export function SimplePromptChain({ chain, className }: SimplePromptChainProps) {
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());

  const toggleCard = (index: number) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  return (
    <div className={cn("flex items-stretch gap-2 overflow-x-auto", className)}>
      {chain.map((link, i) => (
        <div key={i} className="flex items-stretch gap-2">
          {i > 0 && (
            <div className="flex items-center">
              <ChevronRight className="w-4 h-4 text-muted-foreground/30 shrink-0" />
            </div>
          )}
          <PromptChainCard
            link={link}
            isExpanded={expandedCards.has(i)}
            onToggleExpand={() => toggleCard(i)}
          />
        </div>
      ))}
    </div>
  );
}
