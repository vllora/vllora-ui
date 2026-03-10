/**
 * LucyAnalyzeEvalRenderer
 *
 * Custom renderer for analyze_evaluation tool results.
 * Shows structured evaluation health card in Lucy sidebar chat
 * with action buttons so users can respond to Lucy's recommendations.
 */

import { useState } from 'react';
import { ToolCall, extractToolResultData } from '@distri/core';
import { ToolCallState } from '@distri/react';
import { tryParseJson } from '@/utils/modelUtils';
import {
  Activity,
  AlertTriangle,
  Check,
  Loader2,
  Pencil,
  Rocket,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { emitter } from '@/utils/eventEmitter';
import type { AnalyzeEvaluationResult } from '@/lib/distri-finetune-tools/types';
import { SimpleFallbackRenderer } from './SimpleFallbackRenderer';
import { LucyAutoCountdownCard } from './LucyAutoCountdownCard';

// Local type — avoid circular imports with LucyToolRenderer
interface ToolRendererProps {
  toolCall: ToolCall;
  state?: ToolCallState;
}

// =============================================================================
// Sub-components
// =============================================================================

const HEALTH_CONFIG = {
  healthy: { label: 'Healthy', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  warning: { label: 'Warning', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  critical: { label: 'Critical', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
} as const;

function HealthBadge({ overall }: { overall: keyof typeof HEALTH_CONFIG }) {
  const { label, cls } = HEALTH_CONFIG[overall] ?? HEALTH_CONFIG.warning;
  return <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${cls}`}>{label}</span>;
}

/**
 * Unified score color thresholds (used by both progress bar and text):
 *   bad (red)    < 0.5
 *   ok (amber)   0.5–0.64
 *   good (green) ≥ 0.65
 * Aligned with LucyCatchUpCard.scoreColor() for visual consistency.
 */
function scoreBarColor(score: number): string {
  if (score >= 0.65) return 'bg-emerald-500';
  if (score >= 0.5) return 'bg-amber-500';
  return 'bg-red-500';
}

function scoreTextColor(score: number): string {
  if (score >= 0.65) return 'text-emerald-400';
  if (score >= 0.5) return 'text-amber-400';
  return 'text-red-400';
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

// =============================================================================
// Action Buttons
// =============================================================================

const EVAL_ACTION_PROMPTS = {
  accept_iterate: 'I accept the proposed changes. Please apply them and re-run the evaluation to check for improvement.',
  modify_iterate: 'I want to modify the proposed changes before applying them. Let me tell you what I want to adjust.',
  proceed_train: 'The evaluation scores look good. Please proceed to training.',
  run_another: 'I want to run another iteration before training. Please propose changes to improve the weak areas.',
  accept_escalate: 'I agree with the escalation. Please try a different approach as recommended.',
} as const;

function sendPrompt(prompt: string) {
  emitter.emit('vllora_lucy_prompt', { prompt });
}

function EvalActionButtons({ nextAction }: { nextAction: string }) {
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

  if (nextAction === 'iterate') {
    return (
      <div className="flex items-center gap-1.5 pt-1">
        <Button
          size="sm"
          className="h-6 text-[10px] gap-1 flex-1 bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white"
          onClick={() => handleClick('accept', EVAL_ACTION_PROMPTS.accept_iterate)}
        >
          <Check className="w-3 h-3" />
          Accept & Apply
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-[10px] gap-1"
          onClick={() => handleClick('modify', EVAL_ACTION_PROMPTS.modify_iterate)}
        >
          <Pencil className="w-3 h-3" />
          Modify
        </Button>
      </div>
    );
  }

  if (nextAction === 'train') {
    return (
      <div className="flex items-center gap-1.5 pt-1">
        <Button
          size="sm"
          className="h-6 text-[10px] gap-1 flex-1 bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white"
          onClick={() => handleClick('train', EVAL_ACTION_PROMPTS.proceed_train)}
        >
          <Rocket className="w-3 h-3" />
          Proceed to Training
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-[10px] gap-1"
          onClick={() => handleClick('iterate', EVAL_ACTION_PROMPTS.run_another)}
        >
          <Zap className="w-3 h-3" />
          Iterate More
        </Button>
      </div>
    );
  }

  if (nextAction === 'escalate') {
    return (
      <div className="flex items-center gap-1.5 pt-1">
        <Button
          size="sm"
          className="h-6 text-[10px] gap-1 flex-1 bg-amber-600 hover:bg-amber-700 text-white"
          onClick={() => handleClick('escalate', EVAL_ACTION_PROMPTS.accept_escalate)}
        >
          <AlertTriangle className="w-3 h-3" />
          Accept Escalation
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-[10px] gap-1"
          onClick={() => handleClick('iterate', EVAL_ACTION_PROMPTS.run_another)}
        >
          Try Current Approach
        </Button>
      </div>
    );
  }

  return null;
}

// =============================================================================
// Main Card
// =============================================================================

function EvalCheckpointCard({ result }: { result: AnalyzeEvaluationResult }) {
  const { health, per_topic, grader_health, iteration_comparison, escalation, recommendations, next_action } = result;

  return (
    <div className="rounded-lg border border-border bg-card p-3 space-y-2.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-[rgb(var(--theme-500))]" />
          <span className="text-xs font-semibold text-foreground">Evaluation Analysis</span>
        </div>
        {health && <HealthBadge overall={health.overall} />}
      </div>

      {/* Score summary */}
      {health && (
        <div className="text-[11px] text-muted-foreground space-y-0.5">
          <div>Mean: {formatScore(health.mean_score)} &middot; Std: {formatScore(health.std_score)}</div>
          <div>{formatScore(health.percent_above_zero)} scored &gt; 0 &middot; {formatScore(health.percent_perfect)} perfect</div>
        </div>
      )}

      {/* Per-topic breakdown — plain list matching mockup #1 (no dark bg) */}
      {per_topic && per_topic.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Per-Topic</div>
          {per_topic.slice(0, 8).map((t) => (
            <div key={t.topic} className="space-y-0.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-foreground truncate">{t.topic}</span>
                <span className={`tabular-nums font-mono ${scoreTextColor(t.avg_score)}`}>{t.avg_score.toFixed(2)}</span>
              </div>
              <div className="h-[3px] bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${scoreBarColor(t.avg_score)}`}
                  style={{ width: `${Math.min(t.avg_score * 100, 100)}%` }}
                />
              </div>
            </div>
          ))}
          {per_topic.length > 8 && (
            <div className="text-[10px] text-muted-foreground">+{per_topic.length - 8} more</div>
          )}
        </div>
      )}

      {/* Grader health warning */}
      {grader_health && grader_health.verdict !== 'healthy' && (
        <div className="flex items-center gap-1 text-[11px] text-amber-500">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          <span>Grader {grader_health.verdict === 'problematic' ? 'issues detected' : 'needs attention'}</span>
          {grader_health.binary_scoring && <span className="text-[10px]">(binary scores)</span>}
        </div>
      )}

      {/* VS Iteration — inline per-topic deltas (matches mockup #1) */}
      {iteration_comparison && (
        <div className="space-y-1">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
            vs Iteration {iteration_comparison.iteration_number - 1}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
            <span>
              Mean: {formatScore(iteration_comparison.previous_mean)} &rarr; {formatScore(iteration_comparison.current_mean)}{' '}
              <span className={`font-mono ${iteration_comparison.delta >= 0 ? 'text-emerald-500 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                {formatDelta(iteration_comparison.delta)}
              </span>
            </span>
            {iteration_comparison.per_topic_deltas?.slice(0, 4).map((td) => (
              <span key={td.topic}>
                {td.topic}: {formatScore(td.previous)} &rarr; {formatScore(td.current)}{' '}
                <span className={`font-mono ${td.delta >= 0 ? 'text-emerald-500 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                  {formatDelta(td.delta)}
                </span>
              </span>
            ))}
          </div>
          {iteration_comparison.stall_count >= 2 && (
            <div className="flex items-center gap-0.5 text-[10px] text-amber-500">
              <AlertTriangle className="w-3 h-3" />
              <span>{iteration_comparison.stall_count} iterations stalled</span>
            </div>
          )}
        </div>
      )}

      {/* Escalation */}
      {escalation && escalation.level >= 3 && (
        <div className="flex items-center gap-1 text-[11px] text-destructive">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          <span>L{escalation.level}: {escalation.description}</span>
        </div>
      )}

      {/* Reasoning — per-topic diagnosis with colored bullets (matches mockup #1) */}
      {per_topic && per_topic.some((t) => t.recommendation) && (
        <div className="bg-muted/30 rounded-md p-2 space-y-1">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Reasoning</div>
          {per_topic.filter((t) => t.recommendation).slice(0, 5).map((t) => (
            <div key={t.topic} className="text-[11px] text-muted-foreground leading-relaxed">
              <span className={t.avg_score >= 0.65 ? 'text-emerald-400' : t.avg_score >= 0.5 ? 'text-amber-400' : 'text-red-400'}>&#9679;</span>{' '}
              <span className="text-foreground font-medium">{t.topic}</span>{' '}
              ({formatScore(t.avg_score)}): {t.recommendation}
            </div>
          ))}
        </div>
      )}

      {/* Proposed Changes (matches mockup #1 naming) */}
      {recommendations && recommendations.length > 0 && (
        <div className="space-y-0.5">
          <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Proposed Changes</div>
          {recommendations.slice(0, 3).map((r, i) => (
            <div key={i} className="text-[11px] text-foreground flex items-start gap-1">
              <span className="text-muted-foreground shrink-0">{i + 1}.</span>
              <span>{r.action}</span>
            </div>
          ))}
        </div>
      )}

      {/* Action buttons — auto-countdown when healthy + ready to train */}
      {next_action && next_action !== 'hard_stop' && (
        next_action === 'train' && health?.overall === 'healthy'
          ? <LucyAutoCountdownCard />
          : <EvalActionButtons nextAction={next_action} />
      )}
    </div>
  );
}

// =============================================================================
// Main Renderer
// =============================================================================

export function LucyAnalyzeEvalRenderer({ toolCall, state }: ToolRendererProps) {
  const getResultData = (): AnalyzeEvaluationResult | null => {
    if (!state?.result) return null;
    const resultData = extractToolResultData(state.result);
    const rawResult = resultData ? resultData.result : state.result;
    if (typeof rawResult === 'string') return tryParseJson(rawResult) ?? null;
    return rawResult as AnalyzeEvaluationResult;
  };

  // Loading
  if (state?.status === 'running') {
    return (
      <div className="rounded-lg border border-border bg-card p-3">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Analyzing evaluation results...</span>
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
  if (result?.success && result.health) {
    return <EvalCheckpointCard result={result} />;
  }

  if (result && !result.success) {
    return (
      <div className="border border-destructive/30 rounded-lg bg-destructive/10 p-3">
        <div className="text-xs text-destructive">{result.error ?? 'Analysis failed'}</div>
      </div>
    );
  }

  return <SimpleFallbackRenderer toolCall={toolCall} state={state} />;
}
