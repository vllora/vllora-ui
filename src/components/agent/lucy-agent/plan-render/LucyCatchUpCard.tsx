/**
 * LucyCatchUpCard
 *
 * Unified catch-up card matching the "Checkpoint: Evaluation Complete" mockup.
 * Sections: Header → Completed Steps → Score Matrix (eval + training rows) →
 * Cross-Model Insight → Per-Topic table (columns per eval/ft job, tooltip reasoning) →
 * Iteration Delta → Proposed Changes → Training error box (failed only) → Action buttons.
 */

import { useState } from 'react';
import {
  AlertTriangle,
  Check,
  Eye,
  Loader2,
  Pencil,
  RefreshCw,
  Rocket,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { emitter } from '@/utils/eventEmitter';
import type {
  CatchUpCardData,
  CatchUpIterationDelta,
  CatchUpTrainingJob,
  CatchUpTopicReasoning,
  CatchUpCompletedStep,
} from '@/hooks/useFineTuneAgentChat';

// =============================================================================
// Prompts
// =============================================================================

const PROMPTS = {
  analyze: 'Please analyze the evaluation results in detail and tell me what you recommend.',
  retryEval: 'Please retry the failed evaluation. Run it again with the same configuration.',
  diagnoseEval: 'Please diagnose what went wrong with the failed evaluation and give me a detailed analysis.',
  retryTraining: 'Please retry the training job with the same configuration.',
  diagnoseTraining: 'Please diagnose what went wrong with the training job and suggest fixes.',
  checkProgress: 'What\'s the current status of the training job? Show me progress details.',
  accept: 'I see the weak topics from the scores above. Please apply the proposed improvements — regenerate examples and refine prompts for the low-scoring topics.',
  modify: 'I see the proposed changes for the weak topics, but I want to adjust them before applying. Let me tell you what I want to change.',
  skipToTraining: 'Skip further iteration — let\'s proceed directly to training with the current dataset.',
  continueNextStep: 'I just opened this dataset. What should we do next?',
} as const;

function sendPrompt(prompt: string) {
  emitter.emit('vllora_lucy_prompt', { prompt });
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Score color thresholds aligned with mockup:
 *   bad (red)   < 0.5   — mockup uses red for 0.22, 0.31, 0.45
 *   ok (amber)  0.5–0.65 — mockup uses amber for 0.52, 0.54, 0.62
 *   good (green) ≥ 0.65  — mockup uses green for 0.67, 0.68, 0.71, 0.78
 */
function scoreColor(score: number): string {
  if (score >= 0.65) return 'text-emerald-500';
  if (score >= 0.5) return 'text-amber-500';
  return 'text-red-500';
}


function reasoningBullet(cls: CatchUpTopicReasoning['classification']): string {
  if (cls === 'failing') return 'text-red-500';
  if (cls === 'weak') return 'text-red-400';
  if (cls === 'moderate') return 'text-amber-500';
  return 'text-emerald-500';
}

function fmtDelta(d: number): string {
  return `${d >= 0 ? '+' : ''}${d.toFixed(2)}`;
}

function fmtDuration(ms: number): string {
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/** Health badge text + color based on average score (thresholds match mockup). */
function healthBadge(score?: number): { text: string; cls: string } | null {
  if (score == null) return null;
  if (score >= 0.65) return { text: 'Healthy', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' };
  if (score >= 0.5) return { text: 'Needs Attention', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' };
  return { text: 'Critical', cls: 'bg-red-500/15 text-red-400 border-red-500/30' };
}

// =============================================================================
// Reusable pieces
// =============================================================================

function SectionLabel({ children }: { readonly children: React.ReactNode }) {
  return (
    <div className="text-[9px] font-semibold text-muted-foreground uppercase tracking-[0.5px] mb-1">
      {children}
    </div>
  );
}

/** Dark background data box matching mockup's #111116 panels. */
function DataBox({ children }: { readonly children: React.ReactNode }) {
  return (
    <div className="bg-card/60 dark:bg-[#111116] rounded-md p-2 space-y-1">
      {children}
    </div>
  );
}

// =============================================================================
// Card header logic
// =============================================================================

function resolveHeader(data: CatchUpCardData): {
  label: string;
  labelColor: string;
  badge: { text: string; cls: string } | null;
  borderColor: string;
} {
  const hasFailedEval = data.failedJobs.length > 0;
  const hasFailedTraining = data.trainingJobs.some((t) => t.status === 'failed');
  const hasPending = data.pendingDecision != null;
  const hasRunning = data.trainingJobs.some(
    (t) => t.status === 'running' || t.status === 'pending' || t.status === 'queued',
  );
  const hasCompletedTraining = data.trainingJobs.some((t) => t.status === 'completed');
  const hasCompletedEval = data.completedJobs.length > 0;
  const iter = data.completedJobs[0]?.iterationNumber ?? data.pendingDecision?.iterationNumber;
  const avgScore = data.completedJobs[0]?.averageScore;

  if (hasFailedEval || hasFailedTraining) {
    const what = hasFailedTraining ? 'TRAINING FAILED' : 'EVALUATION FAILED';
    return {
      label: `■ ${what}`,
      labelColor: 'text-red-400',
      badge: { text: 'Error', cls: 'bg-red-500/15 text-red-400 border-red-500/30' },
      borderColor: 'border-red-500/40',
    };
  }
  if (hasPending) {
    const iterLabel = iter != null ? `ITERATION ${iter} ` : '';
    return {
      label: `■ ${iterLabel}PENDING DECISION`,
      labelColor: 'text-amber-400',
      badge: healthBadge(data.pendingDecision!.lastScore),
      borderColor: 'border-amber-500/40',
    };
  }
  if (hasRunning) {
    return {
      label: '■ TRAINING IN PROGRESS',
      labelColor: 'text-blue-400',
      badge: null,
      borderColor: 'border-blue-500/40',
    };
  }
  if (hasCompletedTraining) {
    return {
      label: '■ WELCOME BACK',
      labelColor: 'text-emerald-400',
      badge: { text: 'Training Done', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
      borderColor: 'border-emerald-500/40',
    };
  }
  if (hasCompletedEval) {
    const iterLabel = iter != null ? `ITERATION ${iter} CHECKPOINT` : 'EVALUATION COMPLETE';
    return {
      label: `■ ${iterLabel}`,
      labelColor: 'text-[rgb(var(--theme-400))]',
      badge: healthBadge(avgScore),
      borderColor: 'border-[rgb(var(--theme-500))]/40',
    };
  }
  return {
    label: '■ WELCOME BACK',
    labelColor: 'text-muted-foreground',
    badge: null,
    borderColor: 'border-border',
  };
}

// =============================================================================
// Content sections
// =============================================================================

/** Completed pipeline steps — green checkmarks like the mockup. */
function CompletedStepsSection({ steps }: {
  readonly steps: ReadonlyArray<CatchUpCompletedStep>;
}) {
  if (steps.length === 0) return null;
  return (
    <div className="space-y-0.5 text-[10px]">
      {steps.map((s) => (
        <div key={s.step} className="flex items-center gap-1.5">
          <span className="text-emerald-400 shrink-0">✓</span>
          <span className="text-muted-foreground">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Unified Score Matrix — eval jobs + completed/running training jobs in one table.
 * Each row: model name | score | status/records.
 */
function ScoreMatrixSection({ evalJobs, trainingJobs }: {
  readonly evalJobs: CatchUpCardData['completedJobs'];
  readonly trainingJobs: ReadonlyArray<CatchUpTrainingJob>;
}) {
  const hasEvals = evalJobs.length > 0;
  const relevantTraining = trainingJobs.filter(
    (t) => t.status === 'completed' || t.status === 'running' || t.status === 'pending' || t.status === 'queued',
  );
  const hasTraining = relevantTraining.length > 0;

  if (!hasEvals && !hasTraining) return null;

  // Build unified rows
  type MatrixRow = {
    key: string;
    model: string;
    tag: string;
    score: number | null;
    status?: 'running';
  };

  const rows: MatrixRow[] = [];

  for (const j of evalJobs) {
    rows.push({
      key: `eval-${j.jobId}`,
      model: j.rolloutModel ?? 'unknown',
      tag: 'eval',
      score: j.averageScore ?? null,
    });
  }

  for (const t of relevantTraining) {
    const isRunning = t.status === 'running' || t.status === 'pending' || t.status === 'queued';
    rows.push({
      key: `train-${t.jobId}`,
      model: t.fineTunedModel ?? t.baseModel,
      tag: 'fine-tuned',
      score: t.metrics?.trainReward ?? null,
      status: isRunning ? 'running' : undefined,
    });
  }

  return (
    <DataBox>
      <SectionLabel>Score Matrix</SectionLabel>
      <table className="w-full text-[10px]">
        <thead>
          <tr className="border-b border-border/30">
            <th className="text-left py-0.5 pr-2 font-medium text-muted-foreground" />
            <th className="text-right py-0.5 px-1 font-medium text-muted-foreground">Score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.key} className={i < rows.length - 1 ? 'border-b border-border/20' : ''}>
              <td className="py-0.5 pr-2 text-muted-foreground">
                <span className="truncate">{r.model}</span>
                <span className="text-[8px] text-muted-foreground/60 ml-1">({r.tag})</span>
              </td>
              <td className="text-right py-0.5 px-1">
                {r.status === 'running' ? (
                  <span className="text-blue-400 flex items-center justify-end gap-0.5">
                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  </span>
                ) : r.score != null ? (
                  <span className={`font-mono font-medium ${scoreColor(r.score)}`}>
                    {r.score.toFixed(2)}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </DataBox>
  );
}

/**
 * Cross-model insight — compares scores across eval AND training rows.
 * Shown when 2+ scored entries exist (any mix of eval + fine-tuned).
 */
function CrossModelInsight({ evalJobs, trainingJobs }: {
  readonly evalJobs: CatchUpCardData['completedJobs'];
  readonly trainingJobs: ReadonlyArray<CatchUpTrainingJob>;
}) {
  // Build unified scored entries from both eval and training
  type ScoredEntry = { model: string; score: number; tag: 'eval' | 'fine-tuned' };
  const entries: ScoredEntry[] = [];

  for (const j of evalJobs) {
    if (j.averageScore != null) {
      entries.push({ model: j.rolloutModel ?? 'base model', score: j.averageScore, tag: 'eval' });
    }
  }
  for (const t of trainingJobs) {
    if (t.status === 'completed' && t.metrics?.trainReward != null) {
      entries.push({ model: t.fineTunedModel ?? t.baseModel, score: t.metrics.trainReward, tag: 'fine-tuned' });
    }
  }

  if (entries.length < 2) return null;

  // Prefer comparing eval (base) vs fine-tuned, otherwise first vs second
  const evalEntry = entries.find((e) => e.tag === 'eval');
  const ftEntry = entries.find((e) => e.tag === 'fine-tuned');

  const base = evalEntry ?? entries[0];
  const compare = ftEntry ?? entries[entries.length - 1];
  if (base === compare) return null;

  const diff = compare.score - base.score;

  // Suppress when comparing the same model with negligible delta
  if (base.model === compare.model && Math.abs(diff) < 0.01) return null;

  const direction = diff >= 0 ? 'higher' : 'lower';
  const absDiff = Math.abs(diff).toFixed(2);

  let detail = '';
  if (evalEntry && ftEntry) {
    // eval vs fine-tuned comparison
    detail = diff > 0
      ? ' — fine-tuning improved over baseline'
      : diff < -0.05
        ? ' — fine-tuned model underperforms baseline, may need more data or tuning'
        : ' — fine-tuned model is on par with baseline';
  } else if (diff > 0.1) {
    detail = ' — dataset quality is good, base model needs more targeted training';
  }

  return (
    <div className="rounded bg-blue-500/5  border-blue-500 px-2 py-1.5">
      <div className="text-[9px] font-semibold text-blue-400 mb-0.5 uppercase tracking-wider">Cross-Model Insight</div>
      <div className="text-[10px] text-blue-300/80">
        {compare.model} scores {absDiff} {direction} than {base.model}{detail}
      </div>
    </div>
  );
}

/**
 * Per-topic table — columns: Topic | Eval 1 | Eval 2 | … | FT 1 | FT 2 | …
 * Each score cell is color-coded and shows reasoning on hover via tooltip.
 */
function PerTopicSection({ evalJobs, trainingJobs, reasoning }: {
  readonly evalJobs: CatchUpCardData['completedJobs'];
  readonly trainingJobs: ReadonlyArray<CatchUpTrainingJob>;
  readonly reasoning?: ReadonlyArray<CatchUpTopicReasoning>;
}) {
  // Build model entries: each eval/training job with per-topic scores
  type ModelEntry = {
    readonly key: string;
    readonly label: string;
    readonly tag: 'eval' | 'ft';
    readonly scores: ReadonlyMap<string, number>;
  };
  const models: ModelEntry[] = [];

  for (let i = 0; i < evalJobs.length; i++) {
    const j = evalJobs[i];
    if (!j.perTopic || j.perTopic.length === 0) continue;
    const label = j.rolloutModel ?? `Eval ${i + 1}`;
    const scores = new Map(j.perTopic.map((t) => [t.topic, t.mean]));
    models.push({ key: `eval-${j.jobId}`, label, tag: 'eval', scores });
  }

  for (let i = 0; i < trainingJobs.length; i++) {
    const t = trainingJobs[i];
    if (!t.perTopic || t.perTopic.length === 0) continue;
    const label = t.fineTunedModel ?? `FT ${i + 1}`;
    const scores = new Map(t.perTopic.map((tp) => [tp.topic, tp.mean]));
    models.push({ key: `ft-${t.jobId}`, label, tag: 'ft', scores });
  }

  if (models.length === 0) return null;

  // Collect all topics, sort by first model's score (lowest first)
  const topicSet = new Set<string>();
  for (const m of models) {
    for (const topic of m.scores.keys()) topicSet.add(topic);
  }
  const firstModel = models[0];
  const sortedTopics = [...topicSet].sort(
    (a, b) => (firstModel.scores.get(a) ?? 0) - (firstModel.scores.get(b) ?? 0),
  );

  // Reasoning lookup
  const reasoningMap = new Map<string, CatchUpTopicReasoning>();
  if (reasoning) {
    for (const r of reasoning) reasoningMap.set(r.topic, r);
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div>
        <SectionLabel>Per-Topic</SectionLabel>
        <div className="space-y-2">
          {sortedTopics.map((topic) => {
            const r = reasoningMap.get(topic);
            return (
              <TopicGroup
                key={topic}
                topic={topic}
                models={models}
                reasoning={r}
              />
            );
          })}
        </div>
      </div>
    </TooltipProvider>
  );
}

/** A single topic group: topic label header + one row per model underneath. */
function TopicGroup({ topic, models, reasoning }: {
  readonly topic: string;
  readonly models: ReadonlyArray<{
    readonly key: string;
    readonly label: string;
    readonly tag: 'eval' | 'ft';
    readonly scores: ReadonlyMap<string, number>;
  }>;
  readonly reasoning?: CatchUpTopicReasoning;
}) {
  return (
    <div>
      <div className="text-[10px] font-medium text-foreground mb-0.5">{topic}</div>
      <div className="space-y-px pl-2">
        {models.map((m) => {
          const score = m.scores.get(topic);
          return (
            <div key={m.key} className="flex items-center justify-between text-[10px]">
              <span className={`truncate mr-2 ${m.tag === 'ft' ? 'text-purple-400' : 'text-blue-400'}`}>
                {m.label}
              </span>
              {score != null ? (
                <ScoreCell score={score} reasoning={reasoning} />
              ) : (
                <span className="text-muted-foreground/40 font-mono">—</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


/** Single score cell with color + tooltip showing reasoning on hover. */
function ScoreCell({ score, reasoning }: {
  readonly score: number;
  readonly reasoning?: CatchUpTopicReasoning;
}) {
  const cell = (
    <span className={`font-mono font-medium cursor-default ${scoreColor(score)}`}>
      {score.toFixed(2)}
    </span>
  );

  if (!reasoning) return cell;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`font-mono font-medium cursor-help ${scoreColor(score)}`}>
          {score.toFixed(2)}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[250px] text-xs">
        <div className="flex items-start gap-1">
          <span className={`shrink-0 mt-0.5 ${reasoningBullet(reasoning.classification)}`}>●</span>
          <span>{reasoning.insight}</span>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function DeltaSection({ delta, iterNum }: {
  readonly delta: CatchUpIterationDelta;
  readonly iterNum?: number;
}) {
  const label = iterNum != null && iterNum > 0
    ? `vs Iteration ${iterNum - 1}`
    : 'vs Previous';
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px]">
        <DeltaChip label="Mean" prev={delta.prevMean} current={delta.currentMean} delta={delta.delta} />
        {delta.perTopic.slice(0, 4).map((t) => (
          <DeltaChip key={t.topic} label={t.topic} prev={t.prev} current={t.current} delta={t.delta} />
        ))}
      </div>
    </div>
  );
}

function DeltaChip({ label, prev, current, delta }: {
  label: string; prev: number; current: number; delta: number;
}) {
  return (
    <span className="text-muted-foreground">
      {label}: <span className="font-mono">{prev.toFixed(2)}</span>
      <span className="mx-0.5">→</span>
      <span className="font-mono">{current.toFixed(2)}</span>
      {' '}
      <span className={`font-mono font-medium ${delta >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
        {fmtDelta(delta)}
      </span>
    </span>
  );
}

/* ReasoningSection removed — reasoning is now inline in PerTopicSection */

function ProposedChangesSection({ changes }: {
  readonly changes: ReadonlyArray<{
    readonly lever: string;
    readonly description: string;
    readonly applied: boolean;
  }>;
}) {
  if (changes.length === 0) return null;
  return (
    <div>
      <SectionLabel>Proposed Changes</SectionLabel>
      <div className="text-[10px] text-foreground leading-relaxed space-y-0.5">
        {changes.map((c, i) => (
          <div key={i} className="flex items-start gap-1.5">
            <span className="shrink-0 text-muted-foreground">{i + 1}.</span>
            <span>{c.description}</span>
            {c.applied && <Check className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" />}
          </div>
        ))}
      </div>
    </div>
  );
}

function TrainingBox({ job }: { readonly job: CatchUpTrainingJob }) {
  const isFailed = job.status === 'failed';
  const isRunning = job.status === 'running' || job.status === 'pending' || job.status === 'queued';
  const isCompleted = job.status === 'completed';
  const model = job.fineTunedModel ?? job.baseModel;
  const dur = job.startedAt && job.completedAt ? fmtDuration(job.completedAt - job.startedAt) : undefined;

  const statusText = isFailed
    ? <span className="text-red-400">Failed</span>
    : isRunning
      ? <span className="text-blue-400 flex items-center gap-0.5"><Loader2 className="w-2.5 h-2.5 animate-spin" />Running</span>
      : <span className="text-emerald-400">Completed</span>;

  return (
    <DataBox>
      <div className="flex items-center justify-between">
        <SectionLabel>Training</SectionLabel>
        <span className="text-[9px] font-medium uppercase">{statusText}</span>
      </div>
      <div className="text-[10px] space-y-0.5">
        <div><span className="text-muted-foreground">Model:</span> <span className="font-mono text-foreground truncate">{model}</span></div>
        <div>
          <span className="text-muted-foreground">Training:</span>{' '}
          <span className="text-foreground">
            {[
              job.epochs != null ? `${job.epochs} epochs` : null,
              job.totalRows != null ? `${job.totalRows} records` : null,
              dur,
            ].filter(Boolean).join(', ')}
          </span>
        </div>
        {job.metrics && isCompleted && (
          <div>
            <span className="text-muted-foreground">Result:</span>{' '}
            <span className="text-foreground">
              Reward <span className="font-mono font-medium">{job.metrics.trainReward.toFixed(3)}</span>
              {' · '}Loss <span className="font-mono font-medium">{job.metrics.loss.toFixed(3)}</span>
            </span>
          </div>
        )}
      </div>
      {isFailed && job.errorMessage && (
        <div className="font-mono text-[9px] text-red-400 break-words mt-1">
          {job.errorMessage.length > 200 ? `${job.errorMessage.slice(0, 200)}...` : job.errorMessage}
        </div>
      )}
    </DataBox>
  );
}

function EvalErrorBox({ job }: {
  readonly job: CatchUpCardData['failedJobs'][number];
}) {
  const displayError = job.errorMessage && job.errorMessage.length > 200
    ? `${job.errorMessage.slice(0, 200)}...`
    : job.errorMessage;
  return (
    <DataBox>
      <SectionLabel>Error</SectionLabel>
      {displayError ? (
        <div className="font-mono text-[10px] text-red-400 leading-snug break-words">{displayError}</div>
      ) : (
        <div className="text-[10px] text-muted-foreground italic">No error details available. Ask Lucy to diagnose.</div>
      )}
      {job.failedAt && (
        <div className="text-[9px] text-muted-foreground mt-0.5">Failed {new Date(job.failedAt).toLocaleString()}</div>
      )}
    </DataBox>
  );
}

// =============================================================================
// Action builder
// =============================================================================

type ActionDef = {
  key: string; label: string; icon: typeof Eye; prompt: string; primary?: boolean;
};

function buildActions(data: CatchUpCardData): ActionDef[] {
  const a: ActionDef[] = [];
  const hasPending = data.pendingDecision != null;
  const hasProposedChanges = data.proposedChanges.length > 0;
  const completedTrain = data.trainingJobs.find((t) => t.status === 'completed');
  const failedTrain = data.trainingJobs.find((t) => t.status === 'failed');
  const runningTrain = data.trainingJobs.find(
    (t) => t.status === 'running' || t.status === 'pending' || t.status === 'queued',
  );
  const hasFailedEval = data.failedJobs.length > 0;
  const hasCompletedEval = data.completedJobs.length > 0;
  const isHealthy = data.completedJobs.some(
    (j) => j.verdict === 'GO' || (j.averageScore != null && j.averageScore >= 0.7),
  );

  // Pending iteration decision or score-based proposed changes → accept / modify
  if (hasPending || hasProposedChanges) {
    a.push({ key: 'accept', label: 'Accept & Apply', icon: Check, prompt: PROMPTS.accept, primary: true });
    a.push({ key: 'modify', label: 'Modify Changes', icon: Pencil, prompt: PROMPTS.modify });
  }

  if (completedTrain) {
    return a;
  }
  if (failedTrain) {
    a.push({ key: 'retryTrain', label: 'Retry Training', icon: RefreshCw, prompt: PROMPTS.retryTraining, primary: !hasProposedChanges });
    a.push({ key: 'diagnoseTrain', label: 'Diagnose', icon: AlertTriangle, prompt: PROMPTS.diagnoseTraining });
    return a;
  }
  if (runningTrain) {
    a.push({ key: 'progress', label: 'Check Progress', icon: Eye, prompt: PROMPTS.checkProgress, primary: !hasProposedChanges });
    return a;
  }
  if (hasFailedEval) {
    a.push({ key: 'retryEval', label: 'Retry Eval', icon: RefreshCw, prompt: PROMPTS.retryEval, primary: !hasProposedChanges });
    a.push({ key: 'diagnoseEval', label: 'Diagnose', icon: AlertTriangle, prompt: PROMPTS.diagnoseEval });
    return a;
  }
  if (hasCompletedEval) {
    if (!hasProposedChanges) {
      a.push({ key: 'analyze', label: 'View Analysis', icon: Eye, prompt: PROMPTS.analyze, primary: true });
    }
    if (isHealthy) {
      a.push({ key: 'skip', label: 'Skip to Training', icon: Rocket, prompt: PROMPTS.skipToTraining });
    }
  }

  // Fallback: mid-pipeline with completed steps but no eval/training yet
  if (a.length === 0 && data.completedSteps.length > 0) {
    a.push({ key: 'continue', label: 'Continue', icon: Rocket, prompt: PROMPTS.continueNextStep, primary: true });
  }
  return a;
}

// =============================================================================
// Main component
// =============================================================================

interface LucyCatchUpCardProps {
  readonly data: CatchUpCardData;
}

export function LucyCatchUpCard({ data }: LucyCatchUpCardProps) {
  const [clicked, setClicked] = useState<string | null>(null);

  const handleClick = (action: string, prompt: string) => {
    setClicked(action);
    sendPrompt(prompt);
  };

  const header = resolveHeader(data);
  const actions = buildActions(data);
  const evalJob = data.completedJobs[0];
  const failedJob = data.failedJobs[0];
  const trainJob = data.trainingJobs[0];
  const pending = data.pendingDecision;
  // Show proposed changes from either pending decision or iteration state
  const changes = pending?.proposedChanges ?? data.proposedChanges;

  return (
    <div className={`rounded-lg border ${header.borderColor} p-3 space-y-2.5`}>


      {/* ── Header: label + badge ── */}
      <div className="flex items-center justify-between">
        <span className={`text-[10px] font-semibold ${header.labelColor}`}>{header.label}</span>
        {header.badge && (
          <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded border ${header.badge.cls}`}>
            {header.badge.text}
          </span>
        )}
      </div>
      {/* ── Completed steps (green checkmarks) ── */}
      <CompletedStepsSection steps={data.completedSteps} />
      {/* ── Score matrix (eval + training jobs in one table) ── */}
      <ScoreMatrixSection evalJobs={data.completedJobs} trainingJobs={data.trainingJobs} />

      {/* ── Cross-model insight (only when 2+ scored entries across eval + training) ── */}
      <CrossModelInsight evalJobs={data.completedJobs} trainingJobs={data.trainingJobs} />

      {/* ── Eval error box ── */}
      {failedJob && <EvalErrorBox job={failedJob} />}

      {/* ── Per-topic table (all eval + training jobs as columns) ── */}
      <PerTopicSection
        evalJobs={data.completedJobs}
        trainingJobs={data.trainingJobs}
        reasoning={data.reasoning}
      />

      {/* ── Iteration delta (overall comparison) ── */}
      {evalJob?.iterationDelta && (
        <DeltaSection delta={evalJob.iterationDelta} iterNum={evalJob.iterationNumber} />
      )}

      {/* ── Proposed changes ── */}
      {changes.length > 0 && (
        <ProposedChangesSection changes={changes} />
      )}

      {/* ── Training error details (only for failed jobs — completed/running shown in Score Matrix) ── */}
      {trainJob && trainJob.status === 'failed' && <TrainingBox job={trainJob} />}

      {/* ── Action buttons ── */}
      {actions.length > 0 && (
        !clicked ? (
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {actions.map((a) => (
              <Button
                key={a.key}
                size="sm"
                variant={a.primary ? 'default' : 'outline'}
                className={`h-6 text-[10px] gap-1 ${a.primary
                    ? 'bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white'
                    : ''
                  }`}
                onClick={() => handleClick(a.key, a.prompt)}
              >
                <a.icon className="w-3 h-3" />
                {a.label}
              </Button>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <Zap className="w-3 h-3 text-emerald-500" />
            <span>Response sent</span>
          </div>
        )
      )}
    </div>
  );
}
