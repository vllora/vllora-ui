/**
 * LucyAnalyzeEvalRenderer
 *
 * Custom renderer for analyze_evaluation tool results.
 * Shows structured evaluation health card in Lucy sidebar chat.
 */

import { ToolCall, extractToolResultData } from '@distri/core';
import { ToolCallState } from '@distri/react';
import { tryParseJson } from '@/utils/modelUtils';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Loader2,
  Minus,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import type { AnalyzeEvaluationResult } from '@/lib/distri-finetune-tools/types';
import { SimpleFallbackRenderer } from './SimpleFallbackRenderer';

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

const CLASSIFICATION_COLORS: Record<string, string> = {
  failing: 'bg-red-500',
  weak: 'bg-amber-500',
  moderate: 'bg-yellow-500',
  strong: 'bg-emerald-500',
  over_performing: 'bg-blue-500',
};

const ACTION_CONFIG: Record<string, { label: string; cls: string }> = {
  iterate: { label: 'Iterate', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  train: { label: 'Ready to Train', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  escalate: { label: 'Escalate', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  hard_stop: { label: 'Hard Stop', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

function NextActionBadge({ action }: { action: string }) {
  const config = ACTION_CONFIG[action] ?? ACTION_CONFIG.iterate;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${config.cls}`}>
      <ArrowRight className="w-2.5 h-2.5" />
      {config.label}
    </span>
  );
}

function TrendIcon({ trend }: { trend: string }) {
  if (trend === 'improving') return <TrendingUp className="w-3 h-3 text-emerald-500" />;
  if (trend === 'regressing') return <TrendingDown className="w-3 h-3 text-red-500" />;
  return <Minus className="w-3 h-3 text-muted-foreground" />;
}

function formatScore(score: number): string {
  return (score * 100).toFixed(1) + '%';
}

function formatDelta(delta: number): string {
  const sign = delta >= 0 ? '+' : '';
  return sign + (delta * 100).toFixed(1) + '%';
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

      {/* Per-topic breakdown */}
      {per_topic && per_topic.length > 0 && (
        <div className="space-y-0.5">
          <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Topics</div>
          {per_topic.slice(0, 8).map((t) => (
            <div key={t.topic} className="flex items-center gap-1.5 text-[11px]">
              <span className={`w-2 h-2 rounded-full shrink-0 ${CLASSIFICATION_COLORS[t.classification] ?? 'bg-gray-400'}`} />
              <span className="text-foreground truncate flex-1">{t.topic}</span>
              <span className="text-muted-foreground tabular-nums">{formatScore(t.avg_score)}</span>
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

      {/* Iteration comparison */}
      {iteration_comparison && (
        <div className="flex items-center gap-1.5 text-[11px]">
          <TrendIcon trend={iteration_comparison.trend} />
          <span className="text-muted-foreground">
            Iter #{iteration_comparison.iteration_number}: {formatDelta(iteration_comparison.delta)}
          </span>
          {iteration_comparison.stall_count >= 2 && (
            <span className="flex items-center gap-0.5 text-amber-500">
              <AlertTriangle className="w-3 h-3" />
              {iteration_comparison.stall_count} stalled
            </span>
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
          <NextActionBadge action={next_action} />
        </div>
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
