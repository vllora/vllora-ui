/**
 * PipelineFlowBadges
 *
 * Horizontal pipeline visualization: Extract → Topics → Records → Grader.
 * Used in setup guide to show what the skill does.
 */

const STAGES = [
  { label: "Extract", color: "bg-red-400" },
  { label: "Topics", color: "bg-amber-400" },
  { label: "Records", color: "bg-[rgb(var(--theme-400))]" },
  { label: "Grader", color: "bg-violet-400" },
] as const;

export function PipelineFlowBadges() {
  return (
    <div className="flex items-center gap-1.5 flex-wrap mt-3.5 p-3 bg-black/20 rounded-lg border border-white/[0.03]">
      {STAGES.map((stage, i) => (
        <div key={stage.label} className="contents">
          {i > 0 && <span className="text-muted-foreground/30 text-[11px]">→</span>}
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-muted/50 text-muted-foreground border border-border/30">
            <span className={`w-1.5 h-1.5 rounded-full ${stage.color}`} />
            {stage.label}
          </span>
        </div>
      ))}
    </div>
  );
}
