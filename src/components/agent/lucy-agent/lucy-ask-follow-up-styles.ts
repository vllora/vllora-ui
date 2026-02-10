/**
 * Lucy-themed styles for AskFollowUp component
 *
 * Configures the AskFollowUp component from @distri/react to match
 * the polished Lucy chat UI styling with gradient borders, smooth
 * transitions, and theme colors.
 */

import { configureAskFollowUpStyles } from "@distri/react";

/**
 * Apply Lucy-themed styles to all AskFollowUp instances
 * Call this once at app initialization
 */
export function initializeLucyAskFollowUpStyles() {
  configureAskFollowUpStyles({
    // Root container - compact with subtle border
    root: "relative rounded-lg p-[1px] bg-gradient-to-b from-[rgba(var(--theme-500),0.3)] via-border/30 to-border/20 shadow-md",

    // Header - compact
    header:
      "px-3 py-2.5 border-b border-border/20 bg-card/95 rounded-t-lg",
    title: "font-semibold text-sm text-foreground",
    description: "text-xs text-muted-foreground/80 leading-relaxed mt-0.5",

    // Progress bar - slim
    progressContainer: "px-3 pt-2.5 pb-1 bg-card/95",
    progressSegment: "h-1.5 rounded-full transition-all duration-300",
    progressSegmentCompleted: "bg-[rgba(var(--theme-500),1)]",
    progressSegmentActive: "bg-[rgba(var(--theme-500),0.7)]",
    progressSegmentPending: "bg-muted/40",
    progressText: "text-[11px] text-muted-foreground/60 mt-2",

    // Question area - compact
    questionContainer: "px-3 py-2.5 bg-card/95",
    questionLabel: "block text-sm font-medium mb-2 text-foreground",
    requiredIndicator: "text-[rgba(var(--theme-500),1)] ml-0.5",

    // Text input - compact
    textInput:
      "w-full px-3 py-2 text-sm border border-border/50 rounded-md bg-background/80 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-[rgba(var(--theme-500),0.4)] focus:border-[rgba(var(--theme-500),0.5)] transition-all duration-200",

    // Option buttons - compact with good spacing
    optionButton:
      "w-full px-3 py-2 mb-1.5 text-[13px] text-left border border-border/40 rounded-md transition-all duration-200 hover:bg-muted/30 hover:border-border/60",
    optionButtonSelected:
      "!border-[rgba(var(--theme-500),0.5)] !bg-[rgba(var(--theme-500),0.1)] hover:!bg-[rgba(var(--theme-500),0.15)] hover:!border-[rgba(var(--theme-500),0.6)]",

    // Checkbox - standard size
    checkbox:
      "w-4 h-4 border border-border/60 rounded transition-all duration-200",
    checkboxChecked:
      "!bg-[rgba(var(--theme-500),1)] !border-[rgba(var(--theme-500),1)]",

    // Boolean buttons - compact
    booleanContainer: "flex gap-2",
    booleanButton:
      "flex-1 px-3 py-2 text-sm border border-border/40 rounded-md transition-all duration-200 hover:bg-muted/30 hover:border-border/60",
    booleanButtonSelected:
      "!border-[rgba(var(--theme-500),0.5)] !bg-[rgba(var(--theme-500),0.1)] hover:!bg-[rgba(var(--theme-500),0.15)]",

    // Actions footer - Back on left, Skip/Submit on right
    actionsContainer:
      "px-3 py-2.5 flex items-center justify-between border-t border-border/20 bg-muted/5 rounded-b-lg",
    backButton:
      "px-3 py-1.5 text-sm rounded-md transition-all duration-200 hover:bg-muted/40 text-muted-foreground hover:text-foreground",
    backButtonDisabled: "!text-muted-foreground/30 cursor-not-allowed hover:!bg-transparent hover:!text-muted-foreground/30",
    skipButton:
      "px-3 py-1.5 text-sm rounded-md transition-all duration-200 text-muted-foreground hover:bg-muted/40 hover:text-foreground",
    nextButton:
      "px-4 py-1.5 text-sm rounded-md font-medium transition-all duration-200 !bg-[rgba(var(--theme-500),1)] !text-white shadow-sm shadow-[rgba(var(--theme-500),0.2)] hover:!bg-[rgba(var(--theme-400),1)] hover:shadow-md",
    nextButtonDisabled:
      "!bg-muted/40 !text-muted-foreground/40 cursor-not-allowed !shadow-none hover:!bg-muted/40",

    // Completed state - compact
    completedContainer:
      "rounded-lg border border-[rgb(var(--theme-500))]/20 p-3 bg-[rgb(var(--theme-500))]/5",
    completedIcon: "w-4 h-4 text-[rgb(var(--theme-500))]",
    completedText: "flex items-center gap-2 text-sm text-foreground/90",
    answerItem: "text-xs py-1 border-b border-border/10 last:border-0",
    answerQuestion: "text-muted-foreground/70",
    answerValue: "ml-1.5 font-medium text-foreground",
  });
}
