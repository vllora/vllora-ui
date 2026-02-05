/**
 * EvaluationErrorState
 *
 * Card showing when most evaluations failed (>50% errors).
 * Prompts user to click for details.
 */

interface EvaluationErrorStateProps {
  /** Callback when clicking to view details */
  onDryRunClick?: () => void;
}

export function EvaluationErrorState({
  onDryRunClick,
}: EvaluationErrorStateProps) {
  return (
    <button
      onClick={onDryRunClick}
      className="w-full px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/20 flex flex-col min-h-[88px] hover:bg-red-500/15 transition-colors cursor-pointer"
    >
      <div className="flex items-center justify-between w-full mb-2">
        <span className="text-xs text-muted-foreground">Evaluation</span>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Verdict:</span>
          <span className="font-medium text-red-500">NO-GO</span>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <span className="text-sm text-red-400">
          All evaluations failed — click to view details
        </span>
      </div>
    </button>
  );
}
