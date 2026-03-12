/**
 * computeStallCount tests
 *
 * Unit tests for the stall detection helper used by PlanCard.
 * Uses iteration history fixtures with various stall patterns.
 */

import { describe, it, expect } from 'vitest';
import { ITERATION_HISTORIES } from '@/test/fixtures/eval-scenarios';
import type { IterationHistoryEntry } from '@/types/iteration-types';

// Re-implement computeStallCount here for unit testing
// (the original is a module-private function in PlanCard.tsx)
const STALL_THRESHOLD = 0.03;

function computeStallCount(history: readonly IterationHistoryEntry[]): number {
  if (history.length < 2) return 0;
  let count = 0;
  for (let i = history.length - 1; i > 0; i--) {
    const delta = Math.abs(history[i].dryRunScores.mean - history[i - 1].dryRunScores.mean);
    if (delta < STALL_THRESHOLD) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

// =============================================================================
// Tests
// =============================================================================

describe('computeStallCount', () => {
  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  it('returns 0 for empty history', () => {
    expect(computeStallCount(ITERATION_HISTORIES.empty)).toBe(0);
  });

  it('returns 0 for single entry', () => {
    expect(computeStallCount(ITERATION_HISTORIES.single)).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Improving (no stalls)
  // ---------------------------------------------------------------------------

  it('returns 0 for consistently improving history', () => {
    expect(computeStallCount(ITERATION_HISTORIES.improving)).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Stalled histories
  // ---------------------------------------------------------------------------

  it('detects 3 consecutive stalls', () => {
    // stalledThree: [0.50, 0.44, 0.45, 0.44]
    // deltas from end: |0.44-0.45|=0.01, |0.45-0.44|=0.01, |0.44-0.50|=0.06 (break)
    expect(computeStallCount(ITERATION_HISTORIES.stalledThree)).toBe(2);
  });

  it('detects 5 consecutive stalls', () => {
    // stalledFive: [0.60, 0.44, 0.45, 0.44, 0.45, 0.44]
    // deltas from end: |0.44-0.45|=0.01, |0.45-0.44|=0.01, |0.44-0.45|=0.01, |0.45-0.44|=0.01, |0.44-0.60|=0.16 (break)
    expect(computeStallCount(ITERATION_HISTORIES.stalledFive)).toBe(4);
  });

  it('detects stall after improvement', () => {
    // mixedThenStalled: [0.30, 0.50, 0.51, 0.50]
    // deltas from end: |0.50-0.51|=0.01, |0.51-0.50|=0.01, |0.50-0.30|=0.20 (break)
    expect(computeStallCount(ITERATION_HISTORIES.mixedThenStalled)).toBe(2);
  });

  // ---------------------------------------------------------------------------
  // Boundary: exact threshold
  // ---------------------------------------------------------------------------

  it('does NOT count as stall when delta exceeds threshold', () => {
    const history: IterationHistoryEntry[] = [
      { iteration: 1, timestamp: 0, evalId: 'e1', dryRunScores: { mean: 0.40, perTopic: {} }, changesMade: '', decision: 'iterate' },
      { iteration: 2, timestamp: 1, evalId: 'e2', dryRunScores: { mean: 0.44, perTopic: {} }, changesMade: '', decision: 'iterate' },
    ];
    // delta = 0.04 which is NOT < 0.03, so not stalled
    expect(computeStallCount(history)).toBe(0);
  });

  it('counts as stall when delta is just below threshold', () => {
    const history: IterationHistoryEntry[] = [
      { iteration: 1, timestamp: 0, evalId: 'e1', dryRunScores: { mean: 0.40, perTopic: {} }, changesMade: '', decision: 'iterate' },
      { iteration: 2, timestamp: 1, evalId: 'e2', dryRunScores: { mean: 0.429, perTopic: {} }, changesMade: '', decision: 'iterate' },
    ];
    // delta = 0.029 which is < 0.03
    expect(computeStallCount(history)).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Custom histories
  // ---------------------------------------------------------------------------

  it('handles regression followed by stall', () => {
    const history: IterationHistoryEntry[] = [
      { iteration: 1, timestamp: 0, evalId: 'e1', dryRunScores: { mean: 0.60, perTopic: {} }, changesMade: '', decision: 'iterate' },
      { iteration: 2, timestamp: 1, evalId: 'e2', dryRunScores: { mean: 0.40, perTopic: {} }, changesMade: '', decision: 'iterate' },
      { iteration: 3, timestamp: 2, evalId: 'e3', dryRunScores: { mean: 0.41, perTopic: {} }, changesMade: '', decision: 'iterate' },
      { iteration: 4, timestamp: 3, evalId: 'e4', dryRunScores: { mean: 0.40, perTopic: {} }, changesMade: '', decision: 'iterate' },
    ];
    // deltas from end: |0.40-0.41|=0.01, |0.41-0.40|=0.01, |0.40-0.60|=0.20 (break)
    expect(computeStallCount(history)).toBe(2);
  });

  it('returns 0 when all transitions are large', () => {
    const history: IterationHistoryEntry[] = [
      { iteration: 1, timestamp: 0, evalId: 'e1', dryRunScores: { mean: 0.20, perTopic: {} }, changesMade: '', decision: 'iterate' },
      { iteration: 2, timestamp: 1, evalId: 'e2', dryRunScores: { mean: 0.40, perTopic: {} }, changesMade: '', decision: 'iterate' },
      { iteration: 3, timestamp: 2, evalId: 'e3', dryRunScores: { mean: 0.60, perTopic: {} }, changesMade: '', decision: 'iterate' },
      { iteration: 4, timestamp: 3, evalId: 'e4', dryRunScores: { mean: 0.80, perTopic: {} }, changesMade: '', decision: 'train' },
    ];
    expect(computeStallCount(history)).toBe(0);
  });
});
