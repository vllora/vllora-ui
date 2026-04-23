/**
 * PipelinePhaseStrip
 *
 * Compact horizontal progress strip that mirrors the pipeline phase steps from
 * WorkspaceWelcome, but sits persistently at the top of the dataset detail view
 * so users keep the pipeline status in sight while navigating into any section.
 *
 * Hidden when the pipeline is fully complete (all steps done) so it doesn't
 * clutter finished workflows.
 */

import { cn } from "@/lib/utils";

interface PhaseStep {
  readonly label: string;
  readonly short: string;
  readonly isDone: boolean;
}

interface PipelinePhaseStripProps {
  readonly hasKnowledgeSources: boolean;
  readonly hasTopics: boolean;
  readonly hasRecords: boolean;
  readonly hasEvalScript: boolean;
}

export function PipelinePhaseStrip({
  hasKnowledgeSources,
  hasTopics,
  hasRecords,
  hasEvalScript,
}: PipelinePhaseStripProps) {
  const steps: PhaseStep[] = [
    { label: "Documents uploaded", short: "Sources", isDone: hasKnowledgeSources },
    { label: "Extracting content", short: "Extract", isDone: hasKnowledgeSources && hasTopics },
    { label: "Building topic hierarchy", short: "Topics", isDone: hasTopics },
    { label: "Generating training records", short: "Records", isDone: hasRecords },
    { label: "Writing grader", short: "Grader", isDone: hasEvalScript },
  ];
  const activeIndex = steps.findIndex((s) => !s.isDone);
  // All done — nothing to show.
  if (activeIndex === -1) return null;
  // Workflow has nothing yet — the full WorkspaceWelcome covers this; no strip.
  if (!hasKnowledgeSources) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/60 bg-background text-[11px] shrink-0">
      <span className="text-muted-foreground/60 uppercase tracking-wider text-[10px] font-medium">
        Pipeline
      </span>
      <div className="flex items-center gap-1.5 overflow-x-auto">
        {steps.map((step, i) => {
          const isActive = i === activeIndex;
          return (
            <div key={step.label} className="flex items-center gap-1.5 shrink-0">
              <span
                title={step.label}
                className={cn(
                  "flex items-center gap-1 px-1.5 py-0.5 rounded",
                  step.isDone
                    ? "text-[rgb(var(--theme-400))]"
                    : isActive
                      ? "text-[rgb(var(--theme-400))] font-medium"
                      : "text-muted-foreground/50",
                )}
              >
                <span
                  className={cn(
                    "w-3.5 h-3.5 rounded-full flex items-center justify-center text-[8px]",
                    step.isDone
                      ? "bg-[rgba(var(--theme-500),0.15)]"
                      : isActive
                        ? "bg-[rgba(var(--theme-500),0.1)] animate-pulse"
                        : "bg-muted/60",
                  )}
                >
                  {step.isDone ? "✓" : isActive ? "⟳" : "○"}
                </span>
                <span>{step.short}</span>
              </span>
              {i < steps.length - 1 && (
                <span className="text-muted-foreground/30 text-[9px]">→</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
