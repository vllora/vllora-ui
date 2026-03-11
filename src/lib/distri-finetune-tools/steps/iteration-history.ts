/**
 * Iteration History Tools
 *
 * Two tools for cross-iteration memory:
 * - log_iteration: Save an iteration record (scores, changes, decision) to IndexedDB
 * - get_iteration_history: Read all past iterations for a dataset
 *
 * These enable Lucy to compare scores across iterations and detect stalls.
 */

import type { DistriFnTool } from '@distri/core';
import { iterationStateService } from '@/services/service-registry';
import type { IterationPhase, ProposedChange } from '@/types/iteration-types';
import type { ToolHandler } from '../types';

// =============================================================================
// log_iteration Handler
// =============================================================================

export const logIterationHandler: ToolHandler = async (params) => {
  try {
    const { dataset_id, eval_id, scores, changes_made, decision, proposed_changes, phase } = params;

    if (!dataset_id || typeof dataset_id !== 'string') {
      return { success: false, error: 'dataset_id is required' };
    }
    if (!eval_id || typeof eval_id !== 'string') {
      return { success: false, error: 'eval_id is required' };
    }
    if (!scores || typeof scores !== 'object') {
      return { success: false, error: 'scores object is required (with mean and per_topic)' };
    }

    const scoresObj = scores as Record<string, unknown>;
    const meanScore = typeof scoresObj.mean === 'number' ? scoresObj.mean : 0;
    const perTopic = (typeof scoresObj.per_topic === 'object' && scoresObj.per_topic !== null)
      ? scoresObj.per_topic as Record<string, number>
      : {};

    const decisionStr = typeof decision === 'string' ? decision : 'iterate';
    const validDecisions = ['iterate', 'train', 'escalate'] as const;
    const validDecision = validDecisions.includes(decisionStr as typeof validDecisions[number])
      ? (decisionStr as typeof validDecisions[number])
      : 'iterate';

    // Add the iteration entry
    const state = await iterationStateService.addEntry(dataset_id, {
      evalId: eval_id,
      dryRunScores: { mean: meanScore, perTopic },
      changesMade: typeof changes_made === 'string' ? changes_made : '',
      decision: validDecision,
    });

    // Update phase and proposed changes if provided
    if (phase || proposed_changes) {
      const validPhases: IterationPhase[] = [
        'idle', 'evaluating', 'analyzing', 'awaiting_user',
        'applying_changes', 'training', 'post_training',
      ];
      const phaseValue = typeof phase === 'string' && validPhases.includes(phase as IterationPhase)
        ? (phase as IterationPhase)
        : state.phase;

      const parsedChanges = Array.isArray(proposed_changes)
        ? (proposed_changes as ProposedChange[])
        : undefined;

      await iterationStateService.save({
        ...state,
        phase: phaseValue,
        innerLoop: {
          ...state.innerLoop,
          lastEvalId: eval_id,
          lastDryRunScore: meanScore,
          ...(parsedChanges ? { proposedChanges: parsedChanges } : {}),
        },
      });
    }

    return {
      success: true,
      iteration_number: state.iterationNumber,
      total_iterations: state.history.length,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to log iteration',
    };
  }
};

// =============================================================================
// get_iteration_history Handler
// =============================================================================

export const getIterationHistoryHandler: ToolHandler = async (params) => {
  try {
    const { dataset_id } = params;

    if (!dataset_id || typeof dataset_id !== 'string') {
      return { success: false, error: 'dataset_id is required' };
    }

    const state = await iterationStateService.getOrCreate(dataset_id);
    const history = await iterationStateService.getHistory(dataset_id);

    return {
      success: true,
      current_iteration: state.iterationNumber,
      phase: state.phase,
      inner_loop: {
        last_eval_id: state.innerLoop.lastEvalId ?? null,
        last_dry_run_score: state.innerLoop.lastDryRunScore ?? null,
        proposed_changes: state.innerLoop.proposedChanges ?? [],
        user_decision: state.innerLoop.userDecision ?? null,
      },
      outer_loop: {
        last_training_job_id: state.outerLoop.lastTrainingJobId ?? null,
        last_epoch_scores: state.outerLoop.lastEpochScores ?? null,
        post_training_eval_id: state.outerLoop.postTrainingEvalId ?? null,
      },
      history: history.map((entry) => ({
        iteration: entry.iteration,
        timestamp: entry.timestamp,
        eval_id: entry.evalId,
        mean_score: entry.dryRunScores.mean,
        per_topic_scores: entry.dryRunScores.perTopic,
        changes_made: entry.changesMade,
        decision: entry.decision,
      })),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get iteration history',
    };
  }
};

// =============================================================================
// Tool Definitions
// =============================================================================

export const logIterationTool: DistriFnTool = {
  name: 'log_iteration',
  description:
    'Save an iteration record for cross-iteration comparison. Call this after analyzing evaluation results to record the scores, what changes were made, and the decision (iterate, train, or escalate).',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      dataset_id: {
        type: 'string',
        description: 'The dataset ID',
      },
      eval_id: {
        type: 'string',
        description: 'The evaluation job ID that was analyzed',
      },
      scores: {
        type: 'object',
        description: 'Scores object with mean (number) and per_topic (Record<string, number>)',
        properties: {
          mean: { type: 'number', description: 'Overall mean dry run score' },
          per_topic: {
            type: 'object',
            description: 'Per-topic average scores',
          },
        },
        required: ['mean'],
      },
      changes_made: {
        type: 'string',
        description: 'Description of changes made in this iteration',
      },
      decision: {
        type: 'string',
        enum: ['iterate', 'train', 'escalate'],
        description: 'Decision: iterate (improve more), train (proceed to training), escalate (ask user)',
      },
      proposed_changes: {
        type: 'array',
        description: 'Proposed changes for the next iteration',
        items: {
          type: 'object',
          properties: {
            lever: {
              type: 'string',
              enum: ['grader', 'records', 'distribution', 'training_config', 'topics'],
            },
            description: { type: 'string' },
            targetTopics: { type: 'array', items: { type: 'string' } },
            applied: { type: 'boolean' },
          },
        },
      },
      phase: {
        type: 'string',
        enum: ['idle', 'evaluating', 'analyzing', 'awaiting_user', 'applying_changes', 'training', 'post_training'],
        description: 'Current iteration phase',
      },
    },
    required: ['dataset_id', 'eval_id', 'scores', 'decision'],
  },
  handler: async (input) => JSON.stringify(await logIterationHandler(input as Record<string, unknown>)),
} as DistriFnTool;

export const getIterationHistoryTool: DistriFnTool = {
  name: 'get_iteration_history',
  description:
    'Retrieve all past iterations for a dataset, including scores, changes, and decisions per iteration. Use this to compare across iterations and detect stalls or regressions.',
  type: 'function',
  parameters: {
    type: 'object',
    properties: {
      dataset_id: {
        type: 'string',
        description: 'The dataset ID to get iteration history for',
      },
    },
    required: ['dataset_id'],
  },
  handler: async (input) => JSON.stringify(await getIterationHistoryHandler(input as Record<string, unknown>)),
} as DistriFnTool;
