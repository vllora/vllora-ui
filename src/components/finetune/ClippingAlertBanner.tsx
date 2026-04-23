/**
 * ClippingAlertBanner
 *
 * Prominent alert banner shown when training completions are being truncated
 * at max_output_tokens. Appears above the metrics chart to ensure visibility.
 *
 * Thresholds (from training-metrics-guide.md §Completion Metrics):
 * - Critical: >=50% clipped (majority truncated, training signal is noise)
 * - Warning: >=10% clipped (some responses hitting limit)
 * - Below 10%: no banner
 */

import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

// Thresholds aligned with training-metrics-guide.md and get-training-metrics.ts
const CLIPPED_CRITICAL = 0.5;
const CLIPPED_WARNING = 0.1;

interface ClippingAlertBannerProps {
  readonly clippedRatio: number;
  readonly maxLength: number | null;
  readonly meanTerminatedLength: number | null;
  readonly maxOutputTokens: number | null;
  readonly sustained: boolean;
}

function estimateRecommended(
  meanTerminatedLength: number | null,
  maxOutputTokens: number | null,
): number | null {
  // If completions terminate naturally, use that + 50% headroom
  if (meanTerminatedLength != null && meanTerminatedLength > 0) {
    return Math.ceil(meanTerminatedLength * 1.5);
  }
  // All truncated — suggest 2x current
  if (maxOutputTokens != null && maxOutputTokens > 0) {
    return maxOutputTokens * 2;
  }
  return null;
}

export function ClippingAlertBanner({
  clippedRatio,
  maxLength,
  meanTerminatedLength,
  maxOutputTokens,
  sustained,
}: ClippingAlertBannerProps) {
  if (clippedRatio < CLIPPED_WARNING) return null;

  const isCritical = clippedRatio >= CLIPPED_CRITICAL;
  const isCatastrophic = clippedRatio >= 0.9;
  const pct = Math.round(clippedRatio * 100);
  const recommended = estimateRecommended(meanTerminatedLength, maxOutputTokens);
  const currentMax = maxLength ?? maxOutputTokens;

  const message = isCatastrophic
    ? "training is producing no useful signal"
    : isCritical
      ? "majority of training signal is noise"
      : "some responses hitting token limit";

  const bgColor = isCritical
    ? "bg-red-500/10 border-red-500/20"
    : "bg-amber-500/10 border-amber-500/20";
  const textColor = isCritical ? "text-red-400" : "text-amber-400";
  const subtextColor = isCritical ? "text-red-400/70" : "text-amber-400/70";

  return (
    <div className={cn("rounded-md border px-3 py-2 mb-2", bgColor)}>
      <div className="flex items-start gap-2">
        <AlertTriangle className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", textColor)} />
        <div className="min-w-0">
          <p className={cn("text-[11px] font-medium", textColor)}>
            {pct}% of completions truncated — {message}
          </p>
          <div className={cn("text-[10px] mt-0.5 space-y-0.5", subtextColor)}>
            {currentMax != null && (
              <p>Completions hitting max_output_tokens = {Math.round(currentMax)}</p>
            )}
            {meanTerminatedLength != null && meanTerminatedLength > 0 ? (
              <p>Natural completion length: ~{Math.round(meanTerminatedLength)} tokens</p>
            ) : isCritical ? (
              <p>No completions finish naturally — all are forcibly truncated</p>
            ) : null}
            {recommended != null && (
              <p className={cn("font-medium", textColor)}>
                Increase max_output_tokens to at least {recommended}
                {maxOutputTokens != null ? ` (currently ${maxOutputTokens})` : ""}
              </p>
            )}
            {sustained && isCritical && (
              <p>Sustained across multiple training steps — cancel and retry with higher limit</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
