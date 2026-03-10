/**
 * Scenario Registry
 *
 * Mutable singleton that MSW handlers read at request time.
 * Tests set scenarios before making requests, and handlers
 * use getScenario() to decide what response to return.
 */

// =============================================================================
// Types
// =============================================================================

export type EvalScenarioKey = 'healthy' | 'warning' | 'critical' | 'stalled' | 'error';
export type TrainingScenarioKey = 'improving' | 'overfitting' | 'noLearning' | 'error';
export type BehaviorOption = 'success' | 'error' | 'timeout';

export interface ScenarioState {
  readonly evalScenario: EvalScenarioKey;
  readonly trainingScenario: TrainingScenarioKey;
  readonly evalPollsBeforeComplete: number;
  readonly trainingPollsBeforeComplete: number;
  readonly createDelayMs: number;
  readonly pollDelayMs: number;
  readonly uploadBehavior: BehaviorOption;
  readonly evalCreateBehavior: BehaviorOption;
  readonly trainingCreateBehavior: BehaviorOption;
  /** Number of rows the mock finetune-evaluations endpoint returns. Set to match dataset record count. */
  readonly trainingRowCount: number;
}

// =============================================================================
// Default State
// =============================================================================

const DEFAULT_STATE: ScenarioState = {
  evalScenario: 'healthy',
  trainingScenario: 'improving',
  evalPollsBeforeComplete: 0,
  trainingPollsBeforeComplete: 0,
  createDelayMs: 50,
  pollDelayMs: 50,
  uploadBehavior: 'success',
  evalCreateBehavior: 'success',
  trainingCreateBehavior: 'success',
  trainingRowCount: 5,
};

// =============================================================================
// Mutable State
// =============================================================================

let currentState: ScenarioState = { ...DEFAULT_STATE };

// Per-resource poll counters (tracks how many times each resource has been polled)
const evalPollCounts = new Map<string, number>();
const trainingPollCounts = new Map<string, number>();

// =============================================================================
// API
// =============================================================================

/** Get the current scenario state. Called by MSW handlers at request time. */
export function getScenario(): Readonly<ScenarioState> {
  return currentState;
}

/** Update scenario state (partial merge). Call from tests before making requests. */
export function setScenario(partial: Partial<ScenarioState>): void {
  currentState = { ...currentState, ...partial };
}

/** Reset to default state and clear all poll counters. Call in afterEach. */
export function resetScenario(): void {
  currentState = { ...DEFAULT_STATE };
  evalPollCounts.clear();
  trainingPollCounts.clear();
}

// =============================================================================
// Poll Counters
// =============================================================================

/** Increment and return the poll count for an eval run. */
export function incrementEvalPoll(runId: string): number {
  const count = (evalPollCounts.get(runId) ?? 0) + 1;
  evalPollCounts.set(runId, count);
  return count;
}

/** Get current poll count for an eval run without incrementing. */
export function getEvalPollCount(runId: string): number {
  return evalPollCounts.get(runId) ?? 0;
}

/** Increment and return the poll count for a training job. */
export function incrementTrainingPoll(jobId: string): number {
  const count = (trainingPollCounts.get(jobId) ?? 0) + 1;
  trainingPollCounts.set(jobId, count);
  return count;
}

/** Get current poll count for a training job without incrementing. */
export function getTrainingPollCount(jobId: string): number {
  return trainingPollCounts.get(jobId) ?? 0;
}
