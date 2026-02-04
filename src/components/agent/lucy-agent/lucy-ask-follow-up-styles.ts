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
    // Root container - gradient border effect
    root: "relative rounded-xl p-[1px] bg-gradient-to-b from-border/60 via-border/30 to-border/60 shadow-lg",

    // Header
    header:
      "px-5 py-4 border-b border-border/30 bg-card/95 backdrop-blur-sm rounded-t-xl",
    title: "font-semibold text-sm text-foreground",
    description: "text-xs text-muted-foreground/80 mt-1.5 leading-relaxed",

    // Progress bar
    progressContainer: "px-5 pt-4 bg-card/95",
    progressSegment: "h-1.5 rounded-full transition-all duration-300",
    progressSegmentCompleted: "bg-[rgba(var(--theme-500),1)]",
    progressSegmentActive: "bg-[rgba(var(--theme-500),0.6)]",
    progressSegmentPending: "bg-muted/50",
    progressText: "text-xs text-muted-foreground/60 mt-2.5",

    // Question area
    questionContainer: "p-5 bg-card/95",
    questionLabel: "block text-sm font-medium mb-4 text-foreground",
    requiredIndicator: "text-[rgba(var(--theme-500),1)] ml-1",

    // Text input
    textInput:
      "w-full px-4 py-3 text-sm border border-border/50 rounded-lg bg-background/50 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-[rgba(var(--theme-500),0.3)] focus:border-[rgba(var(--theme-500),0.5)] transition-all duration-200",

    // Option buttons (select/multiselect)
    optionButton:
      "w-full px-4 py-3 text-sm text-left border border-border/50 rounded-lg transition-all duration-200 hover:bg-muted/30 hover:border-border",
    optionButtonSelected:
      "border-[rgba(var(--theme-500),0.5)] bg-[rgba(var(--theme-500),0.1)] hover:bg-[rgba(var(--theme-500),0.15)] hover:border-[rgba(var(--theme-500),0.6)]",

    // Checkbox
    checkbox:
      "w-4 h-4 border border-border/60 rounded transition-all duration-200",
    checkboxChecked:
      "bg-[rgba(var(--theme-500),1)] border-[rgba(var(--theme-500),1)]",

    // Boolean buttons
    booleanContainer: "flex gap-3",
    booleanButton:
      "flex-1 px-4 py-3 text-sm border border-border/50 rounded-lg transition-all duration-200 hover:bg-muted/30",
    booleanButtonSelected:
      "border-[rgba(var(--theme-500),0.5)] bg-[rgba(var(--theme-500),0.1)] hover:bg-[rgba(var(--theme-500),0.15)]",

    // Actions footer
    actionsContainer:
      "px-5 py-4 flex items-center justify-between border-t border-border/30 bg-muted/10 rounded-b-xl",
    backButton:
      "px-4 py-2 text-sm rounded-lg transition-all duration-200 hover:bg-muted/50 text-muted-foreground hover:text-foreground",
    backButtonDisabled: "text-muted-foreground/40 cursor-not-allowed hover:bg-transparent hover:text-muted-foreground/40",
    skipButton:
      "px-4 py-2 text-sm rounded-lg transition-all duration-200 text-muted-foreground hover:bg-muted/50 hover:text-foreground",
    nextButton:
      "px-5 py-2 text-sm rounded-lg font-medium transition-all duration-200 !bg-[rgba(var(--theme-500),1)] !text-white shadow-md shadow-[rgba(var(--theme-500),0.25)] hover:!bg-[rgba(var(--theme-400),1)] hover:shadow-lg hover:shadow-[rgba(var(--theme-500),0.3)]",
    nextButtonDisabled:
      "!bg-muted/50 !text-muted-foreground/50 cursor-not-allowed !shadow-none hover:!bg-muted/50",

    // Completed state
    completedContainer:
      "rounded-xl border border-border/40 p-4 bg-card/50 backdrop-blur-sm",
    completedIcon: "w-4 h-4 text-emerald-500",
    completedText: "flex items-center gap-2 text-sm text-muted-foreground",
    answerItem: "text-xs py-1",
    answerQuestion: "text-muted-foreground/70",
    answerValue: "ml-2 font-medium text-foreground/90",
  });
}
