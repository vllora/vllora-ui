/**
 * PromptInheritancePanel
 *
 * Sticky panel above the table showing the Root → Parent → Leaf system prompt
 * chain for the currently focused topic. Opens when user clicks a prompt icon
 * on a topic group header. Supports scroll-based auto-tracking.
 */

import { useState, useEffect, useCallback } from "react";
import { X, ChevronRight, ChevronDown, ChevronUp, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

interface PromptChainLink {
  readonly label: string;
  readonly level: "root" | "parent" | "leaf";
  readonly prompt: string;
}

interface PromptInheritancePanelProps {
  /** Full breadcrumb path: ["Root", "Parent Topic", "Leaf Topic"] */
  readonly breadcrumb: readonly string[];
  /** Prompt chain from root to leaf */
  readonly chain: readonly PromptChainLink[];
  /** Called to close the panel */
  readonly onClose: () => void;
  /** Whether auto-tracking on scroll is active */
  readonly isAutoTracking?: boolean;
}

export function PromptInheritancePanel({
  breadcrumb,
  chain,
  onClose,
  isAutoTracking = false,
}: PromptInheritancePanelProps) {
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set());
  const [isFading, setIsFading] = useState(false);

  const toggleCard = useCallback((index: number) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  // Reset expanded state when chain changes (new topic focused)
  // Trigger crossfade animation during auto-tracking
  const breadcrumbKey = breadcrumb.join("/");
  useEffect(() => {
    setExpandedCards(new Set());
    if (isAutoTracking) {
      setIsFading(true);
      const timer = setTimeout(() => setIsFading(false), 300);
      return () => clearTimeout(timer);
    }
  }, [breadcrumbKey, isAutoTracking]);

  if (chain.length === 0) return null;

  return (
    <div className="border-b border-border bg-background/95 backdrop-blur-sm shrink-0">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border/50">
        <MessageSquare className="w-3.5 h-3.5 text-[rgb(var(--theme-500))]" />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          System Prompt Chain
        </span>

        {/* Breadcrumb */}
        <div className="flex items-center gap-1 ml-2 text-xs text-muted-foreground/60">
          {breadcrumb.map((segment, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="w-3 h-3" />}
              <span className={cn(
                i === breadcrumb.length - 1 ? "text-foreground font-medium" : ""
              )}>
                {segment}
              </span>
            </span>
          ))}
        </div>

        <div className="flex-1" />

        {isAutoTracking && (
          <span className="text-[10px] text-muted-foreground/40 px-1.5 py-0.5 bg-muted/50 rounded">
            auto-tracking
          </span>
        )}

        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Prompt chain cards — crossfade on auto-tracking topic change */}
      <div className={cn(
        "flex items-stretch gap-2 px-4 py-3 overflow-x-auto transition-opacity duration-300",
        isFading ? "opacity-0" : "opacity-100"
      )}>
        {chain.map((link, i) => {
          const isExpanded = expandedCards.has(i);
          const isLeaf = link.level === "leaf";
          const maxLines = isExpanded ? undefined : 3;

          return (
            <div key={i} className="flex items-stretch gap-2">
              {i > 0 && (
                <div className="flex items-center">
                  <ChevronRight className="w-4 h-4 text-muted-foreground/30 shrink-0" />
                </div>
              )}
              <div
                className={cn(
                  "flex flex-col min-w-[200px] max-w-[280px] rounded-lg border p-2.5",
                  isLeaf
                    ? "border-[rgba(var(--theme-500),0.3)] bg-[rgba(var(--theme-500),0.05)]"
                    : "border-border/50 bg-muted/30",
                )}
              >
                {/* Card label */}
                <div className="flex items-center justify-between mb-1.5">
                  <span className={cn(
                    "text-[10px] font-semibold uppercase tracking-wider",
                    isLeaf ? "text-[rgb(var(--theme-500))]" : "text-muted-foreground/60"
                  )}>
                    {link.label}
                  </span>
                  {link.prompt.length > 120 && (
                    <button
                      type="button"
                      onClick={() => toggleCard(i)}
                      className="p-0.5 rounded hover:bg-muted/50 text-muted-foreground/50"
                    >
                      {isExpanded
                        ? <ChevronUp className="w-3 h-3" />
                        : <ChevronDown className="w-3 h-3" />}
                    </button>
                  )}
                </div>

                {/* Prompt text */}
                <p
                  className={cn(
                    "text-xs text-muted-foreground font-mono leading-relaxed whitespace-pre-wrap",
                    !isExpanded && "line-clamp-3"
                  )}
                  style={maxLines ? { WebkitLineClamp: maxLines } : undefined}
                >
                  {link.prompt || "(empty)"}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
