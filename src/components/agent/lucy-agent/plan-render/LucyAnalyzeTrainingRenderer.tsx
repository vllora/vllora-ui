/**
 * LucyAnalyzeTrainingRenderer
 *
 * Custom renderer for analyze_training tool results.
 * Shows structured training analysis card in Lucy sidebar chat.
 */

import { ToolCall, extractToolResultData } from '@distri/core';
import { ToolCallState } from '@distri/react';
import { tryParseJson } from '@/utils/modelUtils';
import {
  ArrowRight,
  GraduationCap,
  Loader2,
  Minus,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import type {
  AnalyzeTrainingResult,
  TopicEpochProgression,
  TrainingPattern,
} from '@/lib/distri-finetune-tools/types';
import { SimpleFallbackRenderer } from './SimpleFallbackRenderer';

// Local type — avoid circular imports with LucyToolRenderer
interface ToolRendererProps {
  toolCall: ToolCall;
  state?: ToolCallState;
}

// =============================================================================
// Sub-components
// =============================================================================

const PATTERN_CONFIG: Record<string, { label: string; cls: string }> = {
  all_improving: { label: 'Improving', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  overfitting: { label: 'Overfitting', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  no_learning: { label: 'No Learning', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  reward_hacking: { label: 'Reward Hacking', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  training_failure: { label: 'Failed', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  mixed: { label: 'Mixed', cls: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400' },
};

function PatternBadge({ pattern }: { pattern: TrainingPattern | 'mixed' }) {
  const config = PATTERN_CONFIG[pattern] ?? PATTERN_CONFIG.mixed;
  return <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${config.cls}`}>{config.label}</span>;
}

const NEXT_ACTION_CONFIG: Record<string, { label: string; cls: string }> = {
  deploy_eval: { label: 'Run Post-Training Eval', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  investigate: { label: 'Investigate', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  retrain: { label: 'Retrain', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  inner_loop: { label: 'Improve Dataset', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
};

function formatScore(score: number): string {
  return (score * 100).toFixed(1) + '%';
}

function formatDelta(delta: number): string {
  const sign = delta >= 0 ? '+' : '';
  return sign + (delta * 100).toFixed(1) + '%';
}

function DeltaIndicator({ delta }: { delta: number }) {
  if (delta > 0.01) return <TrendingUp className="w-3 h-3 text-emerald-500" />;
  if (delta < -0.01) return <TrendingDown className="w-3 h-3 text-red-500" />;
  return <Minus className="w-3 h-3 text-muted-foreground" />;
}

function TopicRow({ topic }: { topic: TopicEpochProgression }) {
  const delta = topic.last_epoch_score - topic.first_epoch_score;
  return (
    <div className="flex items-center gap-1.5 text-[11px]">
      <PatternBadge pattern={topic.pattern} />
      <span className="text-foreground truncate flex-1">{topic.topic}</span>
      <span className="text-muted-foreground tabular-nums">
        {formatScore(topic.first_epoch_score)}
      </span>
      <DeltaIndicator delta={delta} />
      <span className="text-muted-foreground tabular-nums">
        {formatScore(topic.last_epoch_score)}
      </span>
      <span className="text-[10px] text-muted-foreground tabular-nums w-12 text-right">
        ({formatDelta(delta)})
      </span>
    </div>
  );
}

// =============================================================================
// Main Card
// =============================================================================

function TrainingCheckpointCard({ result }: { result: AnalyzeTrainingResult }) {
  const { overall_progression, per_topic, total_epochs, recommendations, next_action } = result;

  // Determine dominant pattern from per_topic
  const dominantPattern = per_topic && per_topic.length > 0
    ? getMostCommonPattern(per_topic)
    : undefined;

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <GraduationCap className="w-3.5 h-3.5 text-[rgb(var(--theme-500))]" />
          <span className="text-xs font-semibold text-foreground">Training Analysis</span>
        </div>
        {dominantPattern && <PatternBadge pattern={dominantPattern} />}
      </div>

      {/* Overall progression */}
      {overall_progression && (
        <div className="text-[11px] text-muted-foreground space-y-0.5">
          <div className="flex items-center gap-1">
            <span>Mean: {formatScore(overall_progression.first_epoch_mean)}</span>
            <DeltaIndicator delta={overall_progression.delta} />
            <span>{formatScore(overall_progression.last_epoch_mean)}</span>
            <span className="text-[10px]">({formatDelta(overall_progression.delta)})</span>
          </div>
          <div>
            {total_epochs && <>{total_epochs} epochs</>}
            {total_epochs && overall_progression.peak_epoch > 0 && <> &middot; </>}
            {overall_progression.peak_epoch > 0 && (
              <>Peak at epoch {overall_progression.peak_epoch} ({formatScore(overall_progression.peak_mean)})</>
            )}
          </div>
        </div>
      )}

      {/* Per-topic breakdown */}
      {per_topic && per_topic.length > 0 && (
        <div className="space-y-0.5">
          <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Topics</div>
          {per_topic.slice(0, 8).map((t) => (
            <TopicRow key={t.topic} topic={t} />
          ))}
          {per_topic.length > 8 && (
            <div className="text-[10px] text-muted-foreground">+{per_topic.length - 8} more</div>
          )}
        </div>
      )}

      {/* Recommendations (top 3) */}
      {recommendations && recommendations.length > 0 && (
        <div className="space-y-0.5">
          <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Recommendations</div>
          {recommendations.slice(0, 3).map((r, i) => (
            <div key={i} className="text-[11px] text-foreground flex items-start gap-1">
              <span className="text-muted-foreground shrink-0">{i + 1}.</span>
              <span>{r.action}</span>
            </div>
          ))}
        </div>
      )}

      {/* Next action */}
      {next_action && (
        <div className="flex items-center gap-1.5 pt-0.5">
          <span className="text-[10px] text-muted-foreground">Next:</span>
          {(() => {
            const config = NEXT_ACTION_CONFIG[next_action] ?? NEXT_ACTION_CONFIG.investigate;
            return (
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${config.cls}`}>
                <ArrowRight className="w-2.5 h-2.5" />
                {config.label}
              </span>
            );
          })()}
        </div>
      )}
    </div>
  );
}

/** Get the most frequent pattern across topics. */
function getMostCommonPattern(topics: readonly TopicEpochProgression[]): TrainingPattern | 'mixed' {
  const counts: Record<string, number> = {};
  for (const t of topics) {
    counts[t.pattern] = (counts[t.pattern] ?? 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!sorted[0]) return 'mixed';
  // Only show dominant if it's > 50%
  if (sorted[0][1] > topics.length / 2) return sorted[0][0] as TrainingPattern;
  return 'mixed';
}

// =============================================================================
// Main Renderer
// =============================================================================

export function LucyAnalyzeTrainingRenderer({ toolCall, state }: ToolRendererProps) {
  const getResultData = (): AnalyzeTrainingResult | null => {
    if (!state?.result) return null;
    const resultData = extractToolResultData(state.result);
    const rawResult = resultData ? resultData.result : state.result;
    if (typeof rawResult === 'string') return tryParseJson(rawResult) ?? null;
    return rawResult as AnalyzeTrainingResult;
  };

  // Loading
  if (state?.status === 'running') {
    return (
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Analyzing training results...</span>
        </div>
      </div>
    );
  }

  // Error
  if (state?.error) {
    return (
      <div className="border border-destructive/30 rounded-lg bg-destructive/10 p-3">
        <div className="text-xs text-destructive">{state.error}</div>
      </div>
    );
  }

  // Completed
  const result = getResultData();
  if (result?.success && (result.overall_progression || result.per_topic)) {
    return <TrainingCheckpointCard result={result} />;
  }

  if (result && !result.success) {
    return (
      <div className="border border-destructive/30 rounded-lg bg-destructive/10 p-3">
        <div className="text-xs text-destructive">{result.error ?? 'Training analysis failed'}</div>
      </div>
    );
  }

  return <SimpleFallbackRenderer toolCall={toolCall} state={state} />;
}
