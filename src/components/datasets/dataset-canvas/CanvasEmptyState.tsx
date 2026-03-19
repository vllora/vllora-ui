/**
 * CanvasEmptyState
 *
 * Empty state shown on the canvas when no topics exist.
 * Two modes:
 * - Skill running: shows live progress tracker (has knowledge sources but no topics)
 * - No data: shows setup guide link
 */

import { Terminal, Upload } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { WaitingOrb } from "@/components/onboarding/WaitingOrb";
import { TerminalHint } from "@/components/onboarding/TerminalHint";

interface CanvasEmptyStateProps {
  readonly onImportClick?: () => void;
  readonly onDocsClick?: () => void;
  /** Whether knowledge sources exist (indicates skill is/was running) */
  readonly hasKnowledgeSources?: boolean;
  /** Number of extracted parts */
  readonly partCount?: number;
}

export function CanvasEmptyState({ onImportClick, onDocsClick, hasKnowledgeSources, partCount = 0 }: CanvasEmptyStateProps) {
  if (hasKnowledgeSources) {
    return <SkillRunningState partCount={partCount} />;
  }
  return <NoDataState onImportClick={onImportClick} onDocsClick={onDocsClick} />;
}

function SkillRunningState({ partCount }: { readonly partCount: number }) {
  const steps = [
    { label: "Document uploaded", isDone: true },
    { label: "Extracting content...", isDone: partCount > 0, isActive: partCount === 0 },
    { label: "Building topic hierarchy", isDone: false, isActive: partCount > 0 },
    { label: "Generating training records", isDone: false },
    { label: "Writing grader", isDone: false },
  ];

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
      <WaitingOrb icon={Terminal} className="mb-6" size="sm" />

      <h3 className="text-base font-bold tracking-tight mb-1.5">Pipeline is running</h3>
      <p className="text-sm text-muted-foreground max-w-[380px] mb-6">
        The finetune skill is processing your documents. Data will appear here as each step completes.
      </p>

      <div className="flex flex-col w-[320px] rounded-xl border border-border/30 bg-card/50 overflow-hidden mb-6">
        {steps.map((step) => {
          const isActive = step.isActive && !step.isDone;
          const isDone = step.isDone;
          return (
            <div
              key={step.label}
              className={`flex items-center gap-2.5 px-4 py-3 text-[12.5px] border-b border-border/20 last:border-b-0 ${
                isDone ? "text-muted-foreground" :
                isActive ? "text-[rgb(var(--theme-400))] font-medium" :
                "text-muted-foreground/40"
              }`}
            >
              <span className={`w-[22px] h-[22px] rounded-full flex items-center justify-center text-[10px] shrink-0 ${
                isDone ? "bg-[rgba(var(--theme-500),0.15)] text-[rgb(var(--theme-400))]" :
                isActive ? "bg-[rgba(var(--theme-500),0.12)] text-[rgb(var(--theme-400))] animate-pulse" :
                "bg-muted/50 text-muted-foreground/30"
              }`}>
                {isDone ? "✓" : isActive ? "⟳" : "○"}
              </span>
              {step.label}
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-2.5 px-4 py-3 rounded-lg bg-indigo-500/[0.04] border border-indigo-500/10">
        <Terminal className="w-4 h-4 text-indigo-400 shrink-0" />
        <p className="text-[11.5px] text-muted-foreground">
          Check your <strong className="text-indigo-300">Claude Code terminal</strong> for detailed progress
        </p>
      </div>
    </div>
  );
}

function NoDataState({ onImportClick, onDocsClick }: { readonly onImportClick?: () => void; readonly onDocsClick?: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
      <div className="w-20 h-20 rounded-2xl border-2 border-dashed border-muted-foreground/20 flex items-center justify-center mb-6">
        <Upload className="w-8 h-8 text-muted-foreground/30" />
      </div>

      <h3 className="text-lg font-medium text-foreground mb-2">No topics yet</h3>
      <p className="text-sm text-muted-foreground max-w-sm mb-6">
        Run the finetune skill to extract topics and generate training data from your documents.
      </p>

      <div className="flex items-center gap-3 mb-6">
        {onDocsClick && (
          <Button variant="outline" size="sm" onClick={onDocsClick}>
            <Upload className="w-4 h-4 mr-1.5" />
            Upload Documents
          </Button>
        )}
        {onImportClick && (
          <Button variant="outline" size="sm" onClick={onImportClick}>
            Import Records
          </Button>
        )}
        <Button variant="outline" size="sm" asChild>
          <Link to="/finetune/setup">Setup Guide</Link>
        </Button>
      </div>

      <TerminalHint
        command='claude "finetune your-document.pdf"'
        highlight="claude"
      />
    </div>
  );
}
