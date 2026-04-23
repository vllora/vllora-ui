/**
 * LucyCompletedJobCard
 *
 * Shown in the sidebar when the user returns to a dataset where
 * an evaluation job has completed but hasn't been reviewed yet.
 * Provides a "Welcome Back" experience with score summary,
 * per-topic breakdown, iteration delta, and action buttons.
 */

import { useState } from 'react';
import {
  Check,
  CheckCircle2,
  Eye,
  FlaskConical,
  Rocket,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { emitter } from '@/utils/eventEmitter';
import type { CatchUpTopicScore, CatchUpIterationDelta } from '@/hooks/useFineTuneAgentChat';

// =============================================================================
// Types
// =============================================================================

interface CompletedJobCardProps {
  readonly jobId: string;
  readonly averageScore?: number;
  readonly completedAt?: number;
  readonly verdict?: string;
  readonly totalRows?: number;
  readonly perTopic?: ReadonlyArray<CatchUpTopicScore>;
  readonly iterationDelta?: CatchUpIterationDelta;
  readonly iterationNumber?: number;
  readonly rolloutModel?: string;
}

// =============================================================================
// Constants
// =============================================================================

const ACTION_PROMPTS = {
  analyze: 'Please analyze the evaluation results in detail and tell me what you recommend.',
  postTrainEval: 'Please run a post-training evaluation to compare the fine-tuned model against the base model.',
  deploy: 'The evaluation looks good. Let\'s proceed to deployment.',
  viewResults: 'Show me the detailed evaluation results — per-topic breakdown and recommendations.',
} as const;

/** Color class based on score value. */
function scoreColor(score: number): string {
  if (score >= 0.7) return 'text-emerald-500';
  if (score >= 0.4) return 'text-amber-500';
  return 'text-red-500';
}

/** Background color class for progress bar fill. */
function barColor(score: number): string {
  if (score >= 0.7) return 'bg-emerald-500';
  if (score >= 0.4) return 'bg-amber-500';
  return 'bg-red-500';
}

/** Format a delta with sign prefix. */
function formatDelta(d: number): string {
  const sign = d >= 0 ? '+' : '';
  return `${sign}${d.toFixed(2)}`;
}

function sendPrompt(prompt: string) {
  emitter.emit('vllora_lucy_prompt', { prompt });
}

// =============================================================================
// Sub-components
// =============================================================================

function TopicRow({ topic, mean, count }: CatchUpTopicScore) {
  const pct = Math.min(mean * 100, 100);
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-foreground truncate mr-2">{topic}</span>
        <span className={`font-mono font-medium ${scoreColor(mean)} shrink-0`}>
          {mean.toFixed(2)}
          <span className="text-muted-foreground font-normal ml-1">({count})</span>
        </span>
      </div>
      <div className="h-1 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${barColor(mean)}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function DeltaChip({ label, prev, current, delta }: {
  label: string; prev: number; current: number; delta: number;
}) {
  const isPositive = delta >= 0;
  return (
    <span className="text-[10px] text-muted-foreground">
      {label}:{' '}
      <span className="font-mono">{prev.toFixed(2)}</span>
      <span className="mx-0.5">→</span>
      <span className="font-mono">{current.toFixed(2)}</span>
      {' '}
      <span className={`font-mono font-medium ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
        {formatDelta(delta)}
      </span>
    </span>
  );
}

// =============================================================================
// Component
// =============================================================================

export function LucyCompletedJobCard({
  averageScore,
  completedAt,
  verdict,
  totalRows,
  perTopic,
  iterationDelta,
  iterationNumber,
  rolloutModel,
}: CompletedJobCardProps) {
  const [clicked, setClicked] = useState<string | null>(null);

  const handleClick = (action: string, prompt: string) => {
    setClicked(action);
    sendPrompt(prompt);
  };

  const timeStr = completedAt
    ? new Date(completedAt).toLocaleString()
    : undefined;

  const scoreStr = averageScore != null
    ? averageScore.toFixed(2)
    : undefined;

  const isHealthy = verdict === 'GO' || (averageScore != null && averageScore >= 0.5);

  // Sort topics by score ascending (worst first) for attention priority
  const sortedTopics = perTopic
    ? [...perTopic].sort((a, b) => a.mean - b.mean)
    : undefined;

  return (
    <div className="border-l-2 border-emerald-500 pl-3 py-2 space-y-2">
      {/* Header */}
      <div className="flex items-center gap-1.5">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
        <span className="text-xs font-semibold text-foreground">
          {iterationNumber != null ? `Iteration ${iterationNumber}` : 'Welcome Back'}
        </span>
        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
          — Evaluation completed
        </span>
      </div>

      {/* Score summary line */}
      <div className="text-[11px] text-muted-foreground space-y-0.5">
        {timeStr && <div>Completed at {timeStr}</div>}
        {scoreStr && (
          <div>
            Average score: <span className={`font-mono font-medium ${scoreColor(averageScore!)}`}>{scoreStr}</span>
            {totalRows != null && <span> · {totalRows} records</span>}
            {rolloutModel && <span> · {rolloutModel}</span>}
          </div>
        )}
        {!scoreStr && totalRows != null && <div>{totalRows} records evaluated</div>}
      </div>

      {/* Per-topic breakdown */}
      {sortedTopics && sortedTopics.length > 0 && (
        <div className="space-y-1">
          <div className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">
            Per-Topic
          </div>
          <div className="space-y-1">
            {sortedTopics.map((t) => (
              <TopicRow key={t.topic} {...t} />
            ))}
          </div>
        </div>
      )}

      {/* Iteration delta */}
      {iterationDelta && (
        <div className="space-y-0.5">
          <div className="text-[9px] font-medium text-muted-foreground uppercase tracking-wider">
            vs Previous
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            <DeltaChip
              label="Mean"
              prev={iterationDelta.prevMean}
              current={iterationDelta.currentMean}
              delta={iterationDelta.delta}
            />
            {iterationDelta.perTopic.slice(0, 3).map((t) => (
              <DeltaChip
                key={t.topic}
                label={t.topic}
                prev={t.prev}
                current={t.current}
                delta={t.delta}
              />
            ))}
          </div>
        </div>
      )}

      {/* Action buttons */}
      {!clicked ? (
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            className="h-6 text-[10px] gap-1 bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white"
            onClick={() => handleClick('analyze', ACTION_PROMPTS.analyze)}
          >
            <Eye className="w-3 h-3" />
            View Analysis
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-[10px] gap-1"
            onClick={() => handleClick('results', ACTION_PROMPTS.viewResults)}
          >
            <FlaskConical className="w-3 h-3" />
            Details
          </Button>
          {isHealthy && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[10px] gap-1"
              onClick={() => handleClick('deploy', ACTION_PROMPTS.deploy)}
            >
              <Rocket className="w-3 h-3" />
              Deploy
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-[10px] gap-1"
            onClick={() => handleClick('postTrainEval', ACTION_PROMPTS.postTrainEval)}
          >
            <Check className="w-3 h-3" />
            Post-Train Eval
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Zap className="w-3 h-3 text-emerald-500" />
          <span>Response sent</span>
        </div>
      )}
    </div>
  );
}
