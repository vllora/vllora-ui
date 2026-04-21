/**
 * RecordsLensSegment
 *
 * Slim segmented switch surfacing records that need attention. Adapted from
 * the "lens" affordance in the Workflow Redesign mock — counts come from the
 * already-loaded record set, no extra fetches. Threshold lives next to the
 * filter helper so UI labels and predicate stay in sync.
 */

import { useMemo } from "react";
import { CircleAlert, Sparkles, Layers3 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DatasetRecord } from "@/types/dataset-types";
import { LOW_QUALITY_THRESHOLD, type QualityLens } from "./record-filters";

interface RecordsLensSegmentProps {
  records: readonly DatasetRecord[];
  value: QualityLens;
  onChange: (next: QualityLens) => void;
}

interface LensCounts {
  total: number;
  needsReview: number;
  lowQuality: number;
}

function computeLensCounts(records: readonly DatasetRecord[]): LensCounts {
  let needsReview = 0;
  let lowQuality = 0;
  for (const r of records) {
    const score = r.evaluation?.score;
    if (score === undefined) needsReview++;
    else if (score < LOW_QUALITY_THRESHOLD) lowQuality++;
  }
  return { total: records.length, needsReview, lowQuality };
}

interface LensButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  count: number;
  tone?: "default" | "warn" | "danger";
  disabled?: boolean;
}

function LensButton({ active, onClick, icon, label, count, tone = "default", disabled }: LensButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium transition-colors",
        active
          ? "bg-background text-foreground shadow-sm border border-border/60"
          : "text-muted-foreground hover:text-foreground border border-transparent",
        disabled && "opacity-40 pointer-events-none",
      )}
    >
      <span
        className={cn(
          "shrink-0 [&_svg]:w-3 [&_svg]:h-3",
          tone === "warn" && "text-amber-400",
          tone === "danger" && "text-red-400",
          tone === "default" && "text-muted-foreground",
        )}
      >
        {icon}
      </span>
      <span>{label}</span>
      <span className="font-mono text-[10px] tabular-nums text-muted-foreground/70">{count}</span>
    </button>
  );
}

export function RecordsLensSegment({ records, value, onChange }: RecordsLensSegmentProps) {
  const counts = useMemo(() => computeLensCounts(records), [records]);

  if (counts.total === 0) return null;
  // Hide the lens until at least one record has been evaluated — otherwise
  // "Needs review" just echoes the total count and the filter does nothing.
  const noScoresYet = counts.needsReview === counts.total && counts.lowQuality === 0;
  if (noScoresYet) return null;

  return (
    <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border/40 bg-muted/10">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mr-2">
        Lens
      </span>
      <LensButton
        active={value === "all"}
        onClick={() => onChange("all")}
        icon={<Layers3 />}
        label="All records"
        count={counts.total}
      />
      <LensButton
        active={value === "needs_review"}
        onClick={() => onChange("needs_review")}
        icon={<Sparkles />}
        label="Needs review"
        count={counts.needsReview}
        tone="warn"
        disabled={counts.needsReview === 0}
      />
      <LensButton
        active={value === "low_quality"}
        onClick={() => onChange("low_quality")}
        icon={<CircleAlert />}
        label={`Low quality (<${LOW_QUALITY_THRESHOLD.toFixed(1)})`}
        count={counts.lowQuality}
        tone="danger"
        disabled={counts.lowQuality === 0}
      />
    </div>
  );
}
