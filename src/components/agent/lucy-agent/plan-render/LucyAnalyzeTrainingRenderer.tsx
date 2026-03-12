/**
 * LucyAnalyzeTrainingRenderer
 *
 * Custom renderer for analyze_training tool results.
 * Shows structured training analysis card in Lucy sidebar chat
 * with action buttons so users can respond to Lucy's recommendations.
 */

import { useState } from 'react';
import { ToolCall, extractToolResultData } from '@distri/core';
import { ToolCallState } from '@distri/react';
import { tryParseJson } from '@/utils/modelUtils';
import {
  ArrowRight,
  Check,
  FlaskConical,
  GraduationCap,
  Loader2,
  Minus,
  Pencil,
  Rocket,
  RotateCcw,
  TrendingDown,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { emitter } from '@/utils/eventEmitter';
import type {
  AnalyzeTrainingResult,
  EvalBaseline,
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

/** Format score as raw decimal (mockup style: 0.45, not 45.0%). */
function formatScore(score: number): string {
  return score.toFixed(2);
}

/** Format delta as signed raw decimal (mockup style: +0.07, -0.02). */
function formatDelta(delta: number): string {
  const sign = delta >= 0 ? '+' : '';
  return sign + delta.toFixed(2);
}

function DeltaIndicator({ delta }: { delta: number }) {
  if (delta > 0.01) return <TrendingUp className="w-3 h-3 text-emerald-500" />;
  if (delta < -0.01) return <TrendingDown className="w-3 h-3 text-red-500" />;
  return <Minus className="w-3 h-3 text-muted-foreground" />;
}

// =============================================================================
// Pipeline Journey (Eval Baseline → Training)
// =============================================================================

function PipelineJourney({
  evalBaseline,
  overallProgression,
  perTopic,
}: {
  evalBaseline: EvalBaseline;
  overallProgression: { first_epoch_mean: number; last_epoch_mean: number; delta: number };
  perTopic?: readonly TopicEpochProgression[];
}) {
  // Build topic → last_epoch_score map for training results
  const trainingTopicScores = new Map(
    (perTopic ?? []).map((t) => [t.topic, t.last_epoch_score]),
  );
  const pipelineDelta = overallProgression.last_epoch_mean - evalBaseline.final_eval_mean;

  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
        Pipeline Journey
      </div>

      {/* Three-stage flow: Eval → Epoch 1 → Final */}
      <div className="flex items-center gap-1 text-[11px]">
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">Eval:</span>
          <span className="font-mono tabular-nums">{formatScore(evalBaseline.final_eval_mean)}</span>
        </div>
        <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">Ep 1:</span>
          <span className="font-mono tabular-nums">{formatScore(overallProgression.first_epoch_mean)}</span>
        </div>
        <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
        <div className="flex items-center gap-1">
          <span className="text-muted-foreground">Final:</span>
          <span className="font-mono font-medium tabular-nums">{formatScore(overallProgression.last_epoch_mean)}</span>
        </div>
        <span className={`font-mono text-[10px] ${pipelineDelta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
          ({formatDelta(pipelineDelta)})
        </span>
      </div>

      {/* Mini pipeline bar */}
      <div className="flex items-center gap-0.5 h-1.5">
        <div className="flex-1 bg-muted rounded-full overflow-hidden h-full" title="Pre-training eval">
          <div
            className="h-full bg-blue-500/50 rounded-full"
            style={{ width: `${Math.min(evalBaseline.final_eval_mean * 100, 100)}%` }}
          />
        </div>
        <div className="flex-1 bg-muted rounded-full overflow-hidden h-full" title="Epoch 1">
          <div
            className="h-full bg-muted-foreground/30 rounded-full"
            style={{ width: `${Math.min(overallProgression.first_epoch_mean * 100, 100)}%` }}
          />
        </div>
        <div className="flex-1 bg-muted rounded-full overflow-hidden h-full" title="Final epoch">
          <div
            className="h-full bg-[rgb(var(--theme-500))] rounded-full"
            style={{ width: `${Math.min(overallProgression.last_epoch_mean * 100, 100)}%` }}
          />
        </div>
      </div>

      {/* Per-topic comparison (eval vs training final) — top 5 */}
      {Object.keys(evalBaseline.per_topic_scores).length > 0 && trainingTopicScores.size > 0 && (
        <div className="space-y-0.5 pt-0.5">
          <div className="text-[9px] text-muted-foreground">Eval → Training (per topic)</div>
          {Object.entries(evalBaseline.per_topic_scores)
            .filter(([topic]) => trainingTopicScores.has(topic))
            .slice(0, 5)
            .map(([topic, evalScore]) => {
              const trainingScore = trainingTopicScores.get(topic) ?? evalScore;
              const delta = trainingScore - evalScore;
              return (
                <div key={topic} className="flex items-center gap-1.5 text-[10px]">
                  <span className="text-foreground truncate flex-1">{topic}</span>
                  <span className="text-muted-foreground tabular-nums font-mono">{formatScore(evalScore)}</span>
                  <ArrowRight className="w-2.5 h-2.5 text-muted-foreground shrink-0" />
                  <span className="text-muted-foreground tabular-nums font-mono">{formatScore(trainingScore)}</span>
                  <span className={`font-mono text-[9px] w-10 text-right ${delta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                    {formatDelta(delta)}
                  </span>
                </div>
              );
            })}
        </div>
      )}

      <div className="text-[9px] text-muted-foreground">
        {evalBaseline.iteration_count} eval iteration{evalBaseline.iteration_count !== 1 ? 's' : ''} before training
      </div>
    </div>
  );
}

/** Score color for table cells (matches mockup: red < 0.35, yellow < 0.55, green). */
function scoreColor(score: number): string {
  if (score < 0.35) return 'text-red-400';
  if (score < 0.55) return 'text-amber-400';
  return 'text-emerald-400';
}

/** Get sorted epoch numbers from topic progressions. */
function getDisplayEpochs(topics: readonly TopicEpochProgression[]): number[] {
  const epochSet = new Set<number>();
  for (const t of topics) {
    for (const k of Object.keys(t.epoch_scores)) epochSet.add(Number(k));
  }
  return [...epochSet].sort((a, b) => a - b);
}

/**
 * Epoch-by-epoch table matching mockup #5 layout:
 * Topic | Epoch 1 | Epoch 2 | ... | Delta
 */
function TopicEpochTable({ topics }: { topics: readonly TopicEpochProgression[] }) {
  const epochs = getDisplayEpochs(topics);
  // Show at most first & last 2 epochs to keep table compact
  const displayEpochs = epochs.length <= 4
    ? epochs
    : [epochs[0], epochs[1], epochs[epochs.length - 1]];

  return (
    <table className="w-full text-[10px]">
      <thead>
        <tr className="border-b border-border">
          <th className="text-left py-0.5 pr-2 font-medium text-muted-foreground">Topic</th>
          {displayEpochs.map((e) => (
            <th key={e} className="text-center py-0.5 px-1 font-medium text-muted-foreground">
              Ep {e}
            </th>
          ))}
          <th className="text-right py-0.5 pl-1 font-medium text-muted-foreground">Delta</th>
        </tr>
      </thead>
      <tbody>
        {topics.slice(0, 8).map((t) => {
          const delta = t.last_epoch_score - t.first_epoch_score;
          return (
            <tr key={t.topic} className="border-b border-border/50 last:border-0">
              <td className="py-0.5 pr-2 text-foreground truncate max-w-[100px]">
                <div className="flex items-center gap-1">
                  <PatternBadge pattern={t.pattern} />
                  <span className="truncate">{t.topic}</span>
                </div>
              </td>
              {displayEpochs.map((e) => {
                const score = t.epoch_scores[e];
                return (
                  <td key={e} className={`text-center py-0.5 px-1 font-mono tabular-nums ${score != null ? scoreColor(score) : 'text-muted-foreground'}`}>
                    {score != null ? score.toFixed(2) : '—'}
                  </td>
                );
              })}
              <td className={`text-right py-0.5 pl-1 font-mono tabular-nums ${delta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatDelta(delta)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// =============================================================================
// Action Buttons
// =============================================================================

const TRAINING_ACTION_PROMPTS = {
  run_post_eval: 'Please run a post-training evaluation on the fine-tuned model so we can compare it with the base model.',
  skip_to_deploy: 'The training looks good. Skip the post-training eval and proceed to deployment.',
  improve_dataset: 'I want to go back and improve the dataset before retraining. Please propose changes based on the training analysis.',
  retrain: 'Please retrain the model with the recommended adjustments.',
  investigate: 'Please investigate the training issues and suggest what went wrong.',
} as const;

function sendPrompt(prompt: string) {
  emitter.emit('vllora_lucy_prompt', { prompt });
}

function TrainingActionButtons({ nextAction }: { nextAction: string }) {
  const [clicked, setClicked] = useState<string | null>(null);

  const handleClick = (action: string, prompt: string) => {
    setClicked(action);
    sendPrompt(prompt);
  };

  if (clicked) {
    return (
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground pt-0.5">
        <Check className="w-3 h-3 text-emerald-500" />
        <span>Response sent</span>
      </div>
    );
  }

  if (nextAction === 'deploy_eval') {
    return (
      <div className="flex items-center gap-1.5 pt-1">
        <Button
          size="sm"
          className="h-6 text-[10px] gap-1 flex-1 bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white"
          onClick={() => handleClick('eval', TRAINING_ACTION_PROMPTS.run_post_eval)}
        >
          <FlaskConical className="w-3 h-3" />
          Run Post-Training Eval
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-[10px] gap-1"
          onClick={() => handleClick('deploy', TRAINING_ACTION_PROMPTS.skip_to_deploy)}
        >
          <Rocket className="w-3 h-3" />
          Deploy
        </Button>
      </div>
    );
  }

  if (nextAction === 'inner_loop') {
    return (
      <div className="flex items-center gap-1.5 pt-1">
        <Button
          size="sm"
          className="h-6 text-[10px] gap-1 flex-1 bg-amber-600 hover:bg-amber-700 text-white"
          onClick={() => handleClick('improve', TRAINING_ACTION_PROMPTS.improve_dataset)}
        >
          <Zap className="w-3 h-3" />
          Improve Dataset
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-[10px] gap-1"
          onClick={() => handleClick('deploy', TRAINING_ACTION_PROMPTS.skip_to_deploy)}
        >
          Deploy Anyway
        </Button>
      </div>
    );
  }

  if (nextAction === 'retrain') {
    return (
      <div className="flex items-center gap-1.5 pt-1">
        <Button
          size="sm"
          className="h-6 text-[10px] gap-1 flex-1 bg-amber-600 hover:bg-amber-700 text-white"
          onClick={() => handleClick('retrain', TRAINING_ACTION_PROMPTS.retrain)}
        >
          <RotateCcw className="w-3 h-3" />
          Retrain
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-[10px] gap-1"
          onClick={() => handleClick('improve', TRAINING_ACTION_PROMPTS.improve_dataset)}
        >
          <Pencil className="w-3 h-3" />
          Improve Data
        </Button>
      </div>
    );
  }

  if (nextAction === 'investigate') {
    return (
      <div className="flex items-center gap-1.5 pt-1">
        <Button
          size="sm"
          className="h-6 text-[10px] gap-1 flex-1 bg-amber-600 hover:bg-amber-700 text-white"
          onClick={() => handleClick('investigate', TRAINING_ACTION_PROMPTS.investigate)}
        >
          <Zap className="w-3 h-3" />
          Investigate
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-[10px] gap-1"
          onClick={() => handleClick('retrain', TRAINING_ACTION_PROMPTS.retrain)}
        >
          <RotateCcw className="w-3 h-3" />
          Retrain
        </Button>
      </div>
    );
  }

  return null;
}

// =============================================================================
// Main Card
// =============================================================================

function TrainingCheckpointCard({ result }: { result: AnalyzeTrainingResult }) {
  const { overall_progression, per_topic, total_epochs, recommendations, next_action, eval_baseline, evaluator_version, training_metrics } = result;

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

      {/* Evaluator version context — only show for v2+ */}
      {evaluator_version && evaluator_version.version > 1 && (
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="px-1.5 py-0.5 rounded bg-muted font-mono font-medium">
            Evaluator v{evaluator_version.version}
          </span>
          {evaluator_version.has_diff && (
            <span className="text-amber-500/70">modified since baseline</span>
          )}
        </div>
      )}

      {/* Reinforcement metrics snapshot */}
      {training_metrics && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
          {training_metrics.reward != null && (
            <span>Reward: <span className="font-mono text-foreground">{training_metrics.reward.toFixed(3)}</span></span>
          )}
          {training_metrics.kl != null && (
            <span>KL: <span className="font-mono text-foreground">{training_metrics.kl.toFixed(4)}</span></span>
          )}
          {training_metrics.loss != null && (
            <span>Loss: <span className="font-mono text-foreground">{training_metrics.loss.toFixed(4)}</span></span>
          )}
          {training_metrics.clipped_ratio != null && (
            <span>Clipped: <span className={`font-mono ${training_metrics.clipped_ratio > 0.3 ? 'text-amber-500' : 'text-foreground'}`}>{(training_metrics.clipped_ratio * 100).toFixed(1)}%</span></span>
          )}
        </div>
      )}

      {/* Pipeline Journey — eval baseline → training (when available) */}
      {eval_baseline && overall_progression && (
        <PipelineJourney evalBaseline={eval_baseline} overallProgression={overall_progression} perTopic={per_topic} />
      )}

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

      {/* Per-topic epoch table (matches mockup #5 layout) */}
      {per_topic && per_topic.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Training Scores by Epoch</div>
          <div className="bg-muted/30 rounded-md p-2 overflow-x-auto">
            <TopicEpochTable topics={per_topic} />
          </div>
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

      {/* Action buttons */}
      {next_action && <TrainingActionButtons nextAction={next_action} />}
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
