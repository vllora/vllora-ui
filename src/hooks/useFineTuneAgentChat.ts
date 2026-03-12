/**
 * useFineTuneAgentChat Hook
 *
 * Specialized hook for finetune agent chat functionality.
 * Uses the vllora_finetune_agent with workflow-aware tools.
 *
 * Key features:
 * - Automatically injects workflow context into messages
 * - Persists workflow state in IndexedDB
 * - Supports resuming workflows across sessions
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useAgent, useChatMessages, createAskFollowUpTool } from '@distri/react';
import type { DistriAnyTool } from '@distri/react';
import { uuidv4, DistriMessage, DistriClient } from '@distri/core';
import { finetuneTools, workflowToContext } from '@/lib/distri-finetune-tools';
import type { PlanStatus } from '@/lib/distri-finetune-tools/steps/proposed-plan-store';
import type { ExecutionProgress } from '@/lib/distri-finetune-tools/steps/execute-plan';
import { stockfishTools, isChessDataset } from '@/lib/distri-finetune-tools/steps';
import { workflowService, datasetService, recordService, evalJobService, iterationStateService } from '@/services/service-registry';
import type { FinetuneWorkflowState, FinetuneStep } from '@/types/workflow-types';
import { getReinforcementJobStatus, getFinetuneEvaluations, getEvaluatorVersions } from '@/services/finetune-api';
import type { EvalJob } from '@/types/eval-job';
import type { IterationState } from '@/types/iteration-types';
import type { TopicEvalStats } from '@/types/dataset-types';
import { emitter } from '@/utils/eventEmitter';

// Type for chat messages returned by useChatMessages
// This is a union type that includes DistriMessage and other event types
type ChatMessage = ReturnType<typeof useChatMessages>['messages'][number];

// ============================================================================
// Constants
// ============================================================================

const FINETUNE_AGENT_NAME = 'vllora_finetune_agent';

// ============================================================================
// Thread ID Management
// ============================================================================

const THREAD_STORAGE_KEY = 'lucy_thread_';

function createNewThreadId(): string {
  return uuidv4();
}

/**
 * Create a fresh thread ID for each dataset session.
 * Always generates a new UUID — old thread messages are not restored.
 * Catch-up cards and buildCatchUpContext() provide all needed context.
 */
function createFreshThreadId(workflowId: string): string {
  const key = `${THREAD_STORAGE_KEY}${workflowId}`;
  const newId = createNewThreadId();
  localStorage.setItem(key, newId);
  return newId;
}

// ============================================================================
// Context Builder
// ============================================================================

function buildContextMessage(
  workflowId: string,
  workflow: FinetuneWorkflowState | null,
  datasetHasEvaluator?: boolean,
  planStatus?: PlanStatus | null,
  executionProgress?: ExecutionProgress | null,
  catchUpContext?: string | null,
): string {
  const context = workflowToContext(workflowId, workflow, datasetHasEvaluator, planStatus, executionProgress);
  // Put WORKFLOW_ID prominently at the top to help LLM copy it exactly
  // UUIDs are hard for LLMs to transcribe from JSON - make it explicit
  let msg = `WORKFLOW_ID: ${workflowId}\n\nContext:\n\`\`\`json\n${JSON.stringify(context, null, 2)}\n\`\`\``;
  if (catchUpContext) {
    msg += `\n\n${catchUpContext}`;
  }
  return msg;
}

// ============================================================================
// Catch-Up Context Builder
// ============================================================================

/** Per-topic score entry for catch-up cards. */
export interface CatchUpTopicScore {
  readonly topic: string;
  readonly mean: number;
  readonly count: number;
  readonly status: string;
}

/** Iteration delta for catch-up cards (current vs previous). */
export interface CatchUpIterationDelta {
  readonly prevMean: number;
  readonly currentMean: number;
  readonly delta: number;
  readonly perTopic: ReadonlyArray<{
    readonly topic: string;
    readonly prev: number;
    readonly current: number;
    readonly delta: number;
  }>;
}

/** Completed training job info for catch-up cards. */
export interface CatchUpTrainingJob {
  readonly jobId: string;
  readonly baseModel: string;
  readonly fineTunedModel?: string;
  readonly status: 'completed' | 'failed' | 'running' | 'pending' | 'queued';
  readonly startedAt?: number;
  readonly completedAt?: number;
  readonly epochs?: number;
  readonly totalRows?: number;
  readonly metrics?: {
    readonly trainReward: number;
    readonly validReward: number;
    readonly loss: number;
    readonly currentEpoch: number;
    readonly totalEpochs: number;
  };
  /** Per-topic scores from the last training epoch (for catch-up card per-topic view) */
  readonly perTopic?: ReadonlyArray<CatchUpTopicScore>;
  readonly errorMessage?: string;
}

/** Step completion info for catch-up cards. */
export interface CatchUpCompletedStep {
  readonly step: string;
  readonly label: string;
}

/** Per-topic reasoning for catch-up cards (derived from scores). */
export interface CatchUpTopicReasoning {
  readonly topic: string;
  readonly score: number;
  readonly classification: 'failing' | 'weak' | 'moderate' | 'strong';
  readonly insight: string;
}

/** Structured catch-up card data for rendering rich cards in the sidebar. */
export interface CatchUpCardData {
  readonly completedJobs: ReadonlyArray<{
    readonly jobId: string;
    readonly averageScore?: number;
    readonly completedAt?: number;
    readonly verdict?: string;
    readonly totalRows?: number;
    readonly perTopic?: ReadonlyArray<CatchUpTopicScore>;
    readonly iterationDelta?: CatchUpIterationDelta;
    readonly iterationNumber?: number;
    readonly rolloutModel?: string;
  }>;
  readonly failedJobs: ReadonlyArray<{
    readonly jobId: string;
    readonly errorMessage?: string;
    readonly failedAt?: number;
  }>;
  readonly pendingDecision?: {
    readonly iterationNumber: number;
    readonly proposedChanges: ReadonlyArray<{
      readonly lever: string;
      readonly description: string;
      readonly applied: boolean;
    }>;
    readonly lastScore?: number;
  };
  readonly trainingJobs: ReadonlyArray<CatchUpTrainingJob>;
  /** Completed pipeline steps for progress display. */
  readonly completedSteps: ReadonlyArray<CatchUpCompletedStep>;
  /** Per-topic reasoning chain (derived from score analysis). */
  readonly reasoning: ReadonlyArray<CatchUpTopicReasoning>;
  /** Proposed changes from iteration state (even when not in awaiting_user phase). */
  readonly proposedChanges: ReadonlyArray<{
    readonly lever: string;
    readonly description: string;
    readonly applied: boolean;
  }>;
  /** Current evaluator version info (latest version from backend). */
  readonly evaluatorVersion?: {
    readonly version: number;
    readonly totalVersions: number;
    readonly createdAt: string;
  };
}

/** Combined catch-up result: text for agent context + structured data for UI cards. */
interface CatchUpResult {
  readonly text: string | null;
  readonly cards: CatchUpCardData | null;
}

/**
 * Build catch-up context for Lucy when a dataset is reopened.
 * Returns both text (for agent context injection) and structured card data (for rich UI).
 */
async function buildCatchUpContext(workflowId: string): Promise<CatchUpResult> {
  const sections: string[] = [];
  const completedJobs: CatchUpCardData['completedJobs'][number][] = [];
  const failedJobs: CatchUpCardData['failedJobs'][number][] = [];
  const trainingJobs: CatchUpTrainingJob[] = [];
  const completedSteps: CatchUpCompletedStep[] = [];
  const reasoning: CatchUpTopicReasoning[] = [];
  const proposedChanges: CatchUpCardData['proposedChanges'][number][] = [];
  let pendingDecision: CatchUpCardData['pendingDecision'];
  let evaluatorVersion: CatchUpCardData['evaluatorVersion'];

  try {
    // Fetch all data sources in parallel
    const [jobs, iterState, workflow, dataset] = await Promise.all([
      evalJobService.getByDataset(workflowId),
      iterationStateService.get(workflowId),
      workflowService.getByDataset(workflowId),
      datasetService.getById(workflowId),
    ]);

    // --- Fetch evaluator versions ---
    if (dataset) {
      try {
        const versions = await getEvaluatorVersions(dataset.id);
        if (versions.length > 0) {
          const latest = versions[0];
          evaluatorVersion = {
            version: latest.version,
            totalVersions: versions.length,
            createdAt: latest.created_at,
          };
          sections.push(
            `CATCH_UP: Evaluator is at version ${latest.version} (${versions.length} total versions). Last updated ${latest.created_at}.`
          );
        }
      } catch {
        // Non-critical — evaluator versions may not exist yet
      }
    }

    // --- Build completed steps from workflow ---
    if (workflow) {
      buildCompletedSteps(workflow, completedSteps);
    }

    // --- Completed eval jobs (with per-topic breakdown + iteration delta) ---
    const unreviewedCompleted = jobs.filter(
      (j: EvalJob) => j.status === 'completed' && !j.reviewedByAgent
    );
    const unreviewedFailed = jobs.filter(
      (j: EvalJob) => j.status === 'failed' && !j.reviewedByAgent
    );

    if (unreviewedCompleted.length > 0) {
      for (const j of unreviewedCompleted) {
        const avgScore = j.pollingSnapshot?.summary?.average_score;
        const byTopic = j.result?.byTopic;

        // Build per-topic scores from DryRunStats
        const perTopic: CatchUpTopicScore[] | undefined = byTopic
          ? Object.entries(byTopic).map(([topic, stats]: [string, TopicEvalStats]) => ({
              topic,
              mean: stats.mean,
              count: stats.count,
              status: stats.status,
            }))
          : undefined;

        // Build per-topic reasoning from scores
        if (perTopic) {
          buildTopicReasoning(perTopic, reasoning);
        }

        // Build iteration delta from history
        const iterationDelta = buildIterationDelta(iterState, j);

        completedJobs.push({
          jobId: j.id,
          averageScore: avgScore ?? undefined,
          completedAt: j.completedAt ?? undefined,
          verdict: undefined,
          totalRows: j.pollingSnapshot?.total_rows ?? undefined,
          perTopic,
          iterationDelta,
          iterationNumber: iterState?.iterationNumber ?? undefined,
          rolloutModel: j.rolloutModel ?? undefined,
        });
      }
      const jobSummaries = unreviewedCompleted.map((j: EvalJob) => {
        const avgScore = j.pollingSnapshot?.summary?.average_score;
        const scoreStr = avgScore != null ? ` (avg score: ${avgScore.toFixed(3)})` : '';
        return `- Job ${j.id}${scoreStr}, completed at ${new Date(j.completedAt ?? 0).toLocaleString()}`;
      });
      sections.push(
        `CATCH_UP: ${unreviewedCompleted.length} completed evaluation(s) not yet reviewed:\n${jobSummaries.join('\n')}\nUse get_evaluation_details to analyze results, then mark_job_reviewed after presenting to user.`
      );
    }

    // --- Failed eval jobs ---
    if (unreviewedFailed.length > 0) {
      for (const j of unreviewedFailed) {
        failedJobs.push({
          jobId: j.id,
          errorMessage: j.error ?? undefined,
          failedAt: j.completedAt ?? undefined,
        });
      }
      const failSummaries = unreviewedFailed.map((j: EvalJob) => {
        const errMsg = j.error ? `: ${j.error.slice(0, 200)}` : '';
        return `- Job ${j.id} failed${errMsg}`;
      });
      sections.push(
        `CATCH_UP: ${unreviewedFailed.length} failed evaluation(s):\n${failSummaries.join('\n')}\nPresent the error and suggest fixes, then mark_job_reviewed.`
      );
    }

    // --- Training job status from workflow state (with API freshness check) ---
    if (workflow?.training) {
      const resolved = await resolveTrainingStatus(workflow);
      trainingJobs.push(resolved);
      if (resolved.status === 'completed') {
        sections.push(
          `CATCH_UP: Training job completed. Model: ${resolved.fineTunedModel ?? resolved.baseModel}. Check if user wants post-training eval or deployment.`
        );
      } else if (resolved.status === 'failed') {
        sections.push(
          `CATCH_UP: Training job failed (job ${resolved.jobId}). Present the error and suggest recovery options.`
        );
      } else if (resolved.status === 'running') {
        sections.push(
          `CATCH_UP: Training job is still running (job ${resolved.jobId}).`
        );
      }
    }

    // --- Pending iteration proposals ---
    if (iterState?.phase === 'awaiting_user') {
      const changes = iterState.innerLoop.proposedChanges ?? [];
      pendingDecision = {
        iterationNumber: iterState.iterationNumber,
        proposedChanges: changes.map((c) => ({
          lever: c.lever,
          description: c.description,
          applied: c.applied,
        })),
        lastScore: iterState.innerLoop.lastDryRunScore ?? undefined,
      };
      const changesSummary = changes.length > 0
        ? changes.map((c) => `- [${c.lever}] ${c.description}`).join('\n')
        : 'No specific changes recorded';
      sections.push(
        `CATCH_UP: Iteration ${iterState.iterationNumber} has pending proposed changes (user hasn't responded yet):\n${changesSummary}\nRe-present these proposals to the user.`
      );
    }

    // --- Proposed changes: prefer latest finetune job, then latest eval job, then iteration state ---
    const completedTraining = trainingJobs.find((t) => t.status === 'completed' && t.perTopic && t.perTopic.length > 0);
    const completedEval = completedJobs.find((j) => j.perTopic && j.perTopic.length > 0);

    if (completedTraining?.perTopic) {
      const fromFt = buildProposedChangesFromScores(completedTraining.perTopic, 'fine-tuned model');
      for (const c of fromFt) proposedChanges.push(c);
    } else if (completedEval?.perTopic) {
      const fromEval = buildProposedChangesFromScores(completedEval.perTopic, 'evaluation');
      for (const c of fromEval) proposedChanges.push(c);
    } else {
      // Fallback: iteration state proposals
      const allChanges = iterState?.innerLoop.proposedChanges ?? [];
      for (const c of allChanges) {
        proposedChanges.push({ lever: c.lever, description: c.description, applied: c.applied });
      }
    }
  } catch (error) {
    // Non-critical — don't block chat initialization
    console.error('[buildCatchUpContext] Error:', error);
  }

  const hasCards = completedJobs.length > 0 || failedJobs.length > 0
    || pendingDecision != null || trainingJobs.length > 0 || completedSteps.length > 0
    || evaluatorVersion != null;
  return {
    text: sections.length > 0 ? sections.join('\n\n') : null,
    cards: hasCards
      ? { completedJobs, failedJobs, pendingDecision, trainingJobs, completedSteps, reasoning, proposedChanges, evaluatorVersion }
      : null,
  };
}

// ============================================================================
// Catch-Up Helpers
// ============================================================================

/**
 * Pipeline step ordering used to infer which steps are completed.
 * If currentStep is at position N, all steps before N are done.
 */
const STEP_ORDER: readonly FinetuneStep[] = [
  'not_started',
  'topics_config',
  'categorize',
  'coverage_generation',
  'grader_config',
  'dry_run',
  'skill_packaging',
  'training',
  'deployment',
  'completed',
] as const;

/** Check if a step is completed via stepStatus OR is before currentStep in the pipeline. */
function isStepDone(
  step: FinetuneStep,
  workflow: FinetuneWorkflowState,
): boolean {
  if (workflow.stepStatus[step] === 'completed') return true;
  // Fallback: if currentStep is past this step, treat it as done
  const stepIdx = STEP_ORDER.indexOf(step);
  const currentIdx = STEP_ORDER.indexOf(workflow.currentStep);
  return stepIdx >= 0 && currentIdx > stepIdx;
}

/** Build completed pipeline steps from workflow state + currentStep inference. */
function buildCompletedSteps(
  workflow: FinetuneWorkflowState,
  out: CatchUpCompletedStep[],
): void {
  if (isStepDone('topics_config', workflow)) {
    const topicInfo = workflow.topicsConfig
      ? ` (${workflow.topicsConfig.topicCount} topics)`
      : '';
    out.push({ step: 'topics', label: `Topics configured${topicInfo}` });
  }
  if (isStepDone('categorize', workflow)) {
    const catInfo = workflow.categorization
      ? `${workflow.categorization.assignedCount} records categorized`
      : 'Records categorized';
    out.push({ step: 'categorize', label: catInfo });
  }
  if (isStepDone('coverage_generation', workflow)) {
    const genInfo = workflow.coverageGeneration
      ? `${workflow.coverageGeneration.syntheticCount} records generated`
      : 'Records generated';
    out.push({ step: 'generate', label: genInfo });
  }
  if (isStepDone('grader_config', workflow)) {
    out.push({ step: 'grader', label: 'Grader configured' });
  }
  if (isStepDone('dry_run', workflow)) {
    const evalInfo = workflow.dryRun
      ? `Evaluation completed (mean: ${workflow.dryRun.mean.toFixed(2)})`
      : 'Evaluation completed';
    out.push({ step: 'evaluation', label: evalInfo });
  }
  if (isStepDone('training', workflow)) {
    out.push({ step: 'training', label: 'Training completed' });
  }
}

/**
 * Derive per-topic reasoning from score classifications.
 * Thresholds aligned with mockup color coding:
 *   failing  < 0.3  (red)    — critically low
 *   weak     < 0.5  (red)    — needs work
 *   moderate < 0.65 (amber)  — room for improvement
 *   strong   ≥ 0.65 (green)  — good performance
 */
function buildTopicReasoning(
  topics: ReadonlyArray<CatchUpTopicScore>,
  out: CatchUpTopicReasoning[],
): void {
  for (const t of topics) {
    let classification: CatchUpTopicReasoning['classification'];
    let insight: string;

    if (t.mean < 0.3) {
      classification = 'failing';
      insight = `Score ${t.mean.toFixed(2)} is critically low — check grader reasons, prompts may be off-topic or too vague`;
    } else if (t.mean < 0.5) {
      classification = 'weak';
      insight = `Score ${t.mean.toFixed(2)} is below target — needs more examples or targeted prompt fixes`;
    } else if (t.mean < 0.65) {
      classification = 'moderate';
      insight = `Score ${t.mean.toFixed(2)} is moderate — room for improvement with refined examples`;
    } else {
      classification = 'strong';
      insight = `Score ${t.mean.toFixed(2)} — good performance, no changes needed`;
    }

    out.push({ topic: t.topic, score: t.mean, classification, insight });
  }
}

type ProposedChange = CatchUpCardData['proposedChanges'][number];

/**
 * Build proposed changes from per-topic scores.
 * Only generates proposals for topics scoring below the "strong" threshold (< 0.65).
 * Sorted by score ascending (worst topics get top priority).
 */
function buildProposedChangesFromScores(
  topics: ReadonlyArray<CatchUpTopicScore>,
  source: 'fine-tuned model' | 'evaluation',
): ProposedChange[] {
  const weak = [...topics]
    .filter((t) => t.mean < 0.65)
    .sort((a, b) => a.mean - b.mean);

  return weak.map((t) => {
    if (t.mean < 0.3) {
      return {
        lever: t.topic,
        description: `Critical (${t.mean.toFixed(2)} from ${source}) — review grader rubric and regenerate examples for this topic`,
        applied: false,
      };
    }
    if (t.mean < 0.5) {
      return {
        lever: t.topic,
        description: `Low score (${t.mean.toFixed(2)} from ${source}) — add more high-quality examples or refine prompts`,
        applied: false,
      };
    }
    return {
      lever: t.topic,
      description: `Below target (${t.mean.toFixed(2)} from ${source}) — minor prompt adjustments may help`,
      applied: false,
    };
  });
}

/**
 * Resolve training job status, fixing stale workflow data by checking the API.
 * If the workflow says 'running' but the API says 'succeeded', updates IndexedDB.
 */
async function resolveTrainingStatus(
  workflow: FinetuneWorkflowState,
): Promise<CatchUpTrainingJob> {
  const t = workflow.training!;
  let status = t.status;
  let fineTunedModel = t.modelId ?? undefined;
  let completedAt: number | undefined = status === 'completed' ? workflow.updatedAt : undefined;
  let errorMessage: string | undefined = status === 'failed' ? 'Training job failed' : undefined;

  // If workflow says running, verify against the API (handles stale IndexedDB)
  if (status === 'running' || status === 'pending' || status === 'queued') {
    try {
      const freshJob = await getReinforcementJobStatus(workflow.workflowId, t.jobId);
      if (freshJob.status === 'succeeded') {
        status = 'completed';
        fineTunedModel = freshJob.fine_tuned_model ?? fineTunedModel;
        completedAt = freshJob.completed_at ? new Date(freshJob.completed_at).getTime() : Date.now();
        // Fix stale workflow in IndexedDB so future loads are correct
        await workflowService.updateStepData(workflow.id, 'training', {
          ...t,
          status: 'completed',
          modelId: freshJob.fine_tuned_model ?? t.modelId,
        });
        emitter.emit('vllora_workflow_updated', { workflowId: workflow.workflowId });
      } else if (freshJob.status === 'failed') {
        status = 'failed';
        errorMessage = freshJob.error_message ?? 'Training job failed';
        await workflowService.updateStepData(workflow.id, 'training', { ...t, status: 'failed' });
        emitter.emit('vllora_workflow_updated', { workflowId: workflow.workflowId });
      }
    } catch {
      // API unavailable — keep stale status (non-critical)
    }
  }

  // For completed training, fetch last-epoch scores (overall + per-topic)
  let metrics = t.metrics ?? undefined;
  let perTopic: CatchUpTopicScore[] | undefined;
  if (status === 'completed' && !metrics) {
    const trainingScores = await fetchTrainingEpochScores(workflow.workflowId, t.jobId);
    metrics = trainingScores?.metrics;
    perTopic = trainingScores?.perTopic;
  }

  return {
    jobId: t.jobId,
    baseModel: t.baseModel,
    fineTunedModel,
    status,
    startedAt: t.startedAt,
    completedAt,
    epochs: metrics?.totalEpochs ?? t.metrics?.totalEpochs ?? undefined,
    totalRows: workflow.coverageGeneration?.syntheticCount ?? undefined,
    metrics,
    perTopic,
    errorMessage,
  };
}

/** Result from fetching training evaluation data. */
interface TrainingEpochScores {
  readonly metrics: CatchUpTrainingJob['metrics'];
  readonly perTopic: CatchUpTopicScore[];
}

/**
 * Fetch last-epoch scores for a completed training job — overall mean + per-topic.
 * Lightweight version of what analyze_training computes.
 */
async function fetchTrainingEpochScores(
  workflowId: string,
  providerJobId: string,
): Promise<TrainingEpochScores | undefined> {
  try {
    const [dataset, records] = await Promise.all([
      datasetService.getById(workflowId),
      recordService.getByDatasetId(workflowId),
    ]);
    if (!dataset) return undefined;

    const evalResponse = await getFinetuneEvaluations(dataset.id, providerJobId);
    const results = evalResponse.results;
    if (results.length === 0) return undefined;

    // Find the last epoch number
    const allEpochs = new Set<number>();
    for (const row of results) {
      for (const ep of Object.keys(row.epochs)) {
        allEpochs.add(Number(ep));
      }
    }
    if (allEpochs.size === 0) return undefined;

    const lastEpoch = Math.max(...allEpochs);
    const totalEpochs = allEpochs.size;

    // Build record ID → topic lookup
    const topicMap = new Map<string, string>();
    for (const rec of records) {
      topicMap.set(rec.id, rec.topic ?? 'uncategorized');
    }

    // Accumulate per-topic scores at last epoch
    const topicAccum = new Map<string, { sum: number; count: number }>();
    let overallSum = 0;
    let overallCount = 0;

    for (const row of results) {
      const epochResults = row.epochs[lastEpoch];
      if (!epochResults) continue;

      // Primary: match by record ID (real backend puts record.id in uploaded JSONL).
      // Fallback: match by row_index position (handles mock data with synthetic IDs).
      // Skip rows that can't be mapped to any record (mock excess rows).
      let topic = topicMap.get(row.row?.id ?? '');
      if (!topic && row.row_index != null && row.row_index < records.length) {
        topic = records[row.row_index].topic ?? 'uncategorized';
      }
      if (!topic) continue;

      for (const r of epochResults) {
        if (r.score == null) continue;
        overallSum += r.score;
        overallCount++;

        const acc = topicAccum.get(topic) ?? { sum: 0, count: 0 };
        topicAccum.set(topic, { sum: acc.sum + r.score, count: acc.count + 1 });
      }
    }

    if (overallCount === 0) return undefined;

    const meanScore = overallSum / overallCount;

    // Build per-topic CatchUpTopicScore array
    const perTopic: CatchUpTopicScore[] = [];
    for (const [topic, acc] of topicAccum) {
      const mean = acc.sum / acc.count;
      perTopic.push({
        topic,
        mean,
        count: acc.count,
        status: mean >= 0.65 ? 'good' : mean >= 0.5 ? 'ok' : 'bad',
      });
    }

    return {
      metrics: {
        trainReward: meanScore,
        validReward: meanScore,
        loss: 1 - meanScore,
        currentEpoch: totalEpochs,
        totalEpochs,
      },
      perTopic,
    };
  } catch {
    // Non-critical — card still renders without scores
    return undefined;
  }
}

/**
 * Build iteration delta by comparing current eval scores against the previous iteration.
 * Returns undefined if there's no prior iteration to compare against.
 */
function buildIterationDelta(
  iterState: IterationState | null,
  job: EvalJob,
): CatchUpIterationDelta | undefined {
  if (!iterState || iterState.history.length === 0) return undefined;

  const currentByTopic = job.result?.byTopic;
  const currentMean = job.pollingSnapshot?.summary?.average_score;
  if (currentMean == null || !currentByTopic) return undefined;

  // Get the most recent history entry (previous iteration)
  const prevEntry = iterState.history[iterState.history.length - 1];
  if (!prevEntry?.dryRunScores) return undefined;

  const perTopic = Object.entries(currentByTopic).map(([topic, stats]: [string, TopicEvalStats]) => {
    const prev = prevEntry.dryRunScores.perTopic[topic] ?? 0;
    return { topic, prev, current: stats.mean, delta: stats.mean - prev };
  });

  return {
    prevMean: prevEntry.dryRunScores.mean,
    currentMean,
    delta: currentMean - prevEntry.dryRunScores.mean,
    perTopic,
  };
}

// ============================================================================
// Hook Options
// ============================================================================

interface UseFineTuneAgentChatOptions {
  /** The dataset ID being processed */
  workflowId: string;
  /** The dataset name for display */
  datasetName?: string;
  /** Training goals (used for workflow initialization) */
  trainingGoals?: string;
  /** Current plan status (from PlanContext) */
  planStatus?: PlanStatus | null;
  /** Current execution progress (from PlanContext, used for resume context) */
  executionProgress?: ExecutionProgress | null;
}

// ============================================================================
// Hook Return Type
// ============================================================================

interface UseFineTuneAgentChatReturn {
  /** The agent instance */
  agent: any;
  /** Whether the agent is loading */
  agentLoading: boolean;
  /** Current thread ID */
  threadId: string;
  /** Tools available to the agent */
  tools: DistriAnyTool[];
  /** Chat messages */
  messages: ChatMessage[];
  /** Current workflow state (null if none) */
  workflow: FinetuneWorkflowState | null;
  /** Whether workflow is loading */
  workflowLoading: boolean;
  /** Create new chat thread */
  handleNewChat: () => void;
  /** Refresh workflow state from IndexedDB */
  refreshWorkflow: () => Promise<void>;
  /** Prepare message with context injection (supports additional parts like files) */
  prepareMessage: (userMessage: string, additionalParts?: any[]) => DistriMessage;
  /** Structured catch-up card data for rendering rich cards on session resume */
  catchUpCards: CatchUpCardData | null;
}

// ============================================================================
// Hook
// ============================================================================

export function useFineTuneAgentChat(
  options: UseFineTuneAgentChatOptions
): UseFineTuneAgentChatReturn {
  const { workflowId, trainingGoals, planStatus, executionProgress: executionProgressFromContext } = options;

  // Agent state
  const { agent, loading: agentLoading } = useAgent({
    agentIdOrDef: FINETUNE_AGENT_NAME,
  });

  // Thread state - persisted per dataset so chat history survives refresh
  const [threadId, setThreadId] = useState<string>(() => createFreshThreadId(workflowId));

  // Workflow state
  const [workflow, setWorkflow] = useState<FinetuneWorkflowState | null>(null);
  const [workflowLoading, setWorkflowLoading] = useState(true);
  // Track if dataset has eval script configured (via UI, separate from workflow)
  const [datasetHasEvalScript, setDatasetHasEvalScript] = useState(false);
  // Catch-up context for session resumption (unreviewed jobs, pending proposals)
  const [catchUpContext, setCatchUpContext] = useState<string | null>(null);
  // Structured catch-up card data for rendering rich cards in the sidebar
  const [catchUpCards, setCatchUpCards] = useState<CatchUpCardData | null>(null);

  // Check if this is a chess-related dataset (enables Stockfish tools)
  const isChess = useMemo(() => isChessDataset(trainingGoals), [trainingGoals]);

  // Tools - includes finetune tools + UI tools (ask_follow_up)
  // Conditionally includes Stockfish tools for chess datasets
  const tools = useMemo<DistriAnyTool[]>(
    () => [
      ...finetuneTools,
      ...(isChess ? stockfishTools : []),
      createAskFollowUpTool(),
    ],
    [isChess]
  );

  // Chat messages
  const { messages } = useChatMessages({
    agent: agent!,
    threadId,
    onError: (error: any) => {
      console.error('[useFineTuneAgentChat] Error fetching messages:', error);
    },
  });

  // Load workflow state on mount and when workflowId changes
  const refreshWorkflow = useCallback(async () => {
    // Skip loading if no workflowId
    if (!workflowId) {
      setWorkflowLoading(false);
      setWorkflow(null);
      setDatasetHasEvalScript(false);
      return;
    }

    setWorkflowLoading(true);
    try {
      const [workflowState, dataset, catchUp] = await Promise.all([
        workflowService.getByDataset(workflowId),
        datasetService.getById(workflowId),
        buildCatchUpContext(workflowId),
      ]);
      setWorkflow(workflowState);
      setDatasetHasEvalScript(!!dataset?.evalScript);
      setCatchUpContext(catchUp.text);
      setCatchUpCards(catchUp.cards);
    } catch (error) {
      console.error('[useFineTuneAgentChat] Error loading workflow:', error);
      setWorkflow(null);
      setDatasetHasEvalScript(false);
      setCatchUpContext(null);
      setCatchUpCards(null);
    } finally {
      setWorkflowLoading(false);
    }
  }, [workflowId]);

  // Initial load
  useEffect(() => {
    refreshWorkflow();
  }, [refreshWorkflow]);

  // Listen for workflow updated events (e.g., after execute_plan completes)
  useEffect(() => {
    const handleWorkflowUpdated = ({ workflowId: updatedDatasetId }: { workflowId: string }) => {
      if (updatedDatasetId === workflowId) {
        console.log('[useFineTuneAgentChat] Workflow updated event received, refreshing...');
        refreshWorkflow();
      }
    };

    emitter.on('vllora_workflow_updated', handleWorkflowUpdated);
    return () => {
      emitter.off('vllora_workflow_updated', handleWorkflowUpdated);
    };
  }, [workflowId, refreshWorkflow]);

  // Load persisted thread when dataset changes
  useEffect(() => {
    setThreadId(createFreshThreadId(workflowId));
  }, [workflowId]);

  // Create new chat thread (persists to localStorage)
  const handleNewChat = useCallback(() => {
    const newId = createNewThreadId();
    localStorage.setItem(`${THREAD_STORAGE_KEY}${workflowId}`, newId);
    setThreadId(newId);
  }, [workflowId]);

  // Prepare message with context injection (supports file parts)
  const prepareMessage = useCallback(
    (userMessage: string, additionalParts?: any[]): DistriMessage => {
      // Build context from current workflow state
      const contextText = buildContextMessage(workflowId, workflow, datasetHasEvalScript, planStatus, executionProgressFromContext, catchUpContext);

      // Create message with context prepended
      const fullMessage = `${contextText}\n\nUser message: ${userMessage}`;

      // Start with the text part
      const parts: any[] = [{ part_type: 'text', data: fullMessage }];

      // Add any additional parts (files, images, etc.)
      if (additionalParts && additionalParts.length > 0) {
        parts.push(...additionalParts);
      }

      // Clear catch-up context after first use (only inject once)
      if (catchUpContext) {
        setCatchUpContext(null);
      }

      return DistriClient.initDistriMessage('user', parts);
    },
    [workflowId, workflow, datasetHasEvalScript, planStatus, executionProgressFromContext, catchUpContext]
  );

  return {
    agent,
    agentLoading,
    threadId,
    tools,
    messages,
    workflow,
    workflowLoading,
    handleNewChat,
    refreshWorkflow,
    prepareMessage,
    catchUpCards,
  };
}

// ============================================================================
// Helper Hook: Track Workflow Updates
// ============================================================================

/**
 * Hook to subscribe to workflow changes via polling
 * (IndexedDB doesn't have built-in change notifications)
 */
export function useWorkflowPolling(
  workflowId: string,
  enabled: boolean = true,
  intervalMs: number = 2000
) {
  const [workflow, setWorkflow] = useState<FinetuneWorkflowState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!enabled) return;

    let mounted = true;

    const poll = async () => {
      try {
        const state = await workflowService.getByDataset(workflowId);
        if (mounted) {
          setWorkflow(state);
          setLoading(false);
        }
      } catch (error) {
        console.error('[useWorkflowPolling] Error:', error);
      }
    };

    // Initial load
    poll();

    // Poll for updates
    const interval = setInterval(poll, intervalMs);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [workflowId, enabled, intervalMs]);

  return { workflow, loading };
}
