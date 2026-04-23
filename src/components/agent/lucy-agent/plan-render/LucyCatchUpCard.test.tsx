/**
 * LucyCatchUpCard tests
 *
 * Covers all catch-up card scenarios: header, sections, action buttons,
 * and proposed changes for different dataset states.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LucyCatchUpCard } from './LucyCatchUpCard';
import type {
  CatchUpCardData,
  CatchUpTrainingJob,
  CatchUpTopicScore,
} from '@/hooks/useFineTuneAgentChat';

// =============================================================================
// Mock event emitter (buttons emit prompts via this)
// =============================================================================

const emitSpy = vi.fn();
vi.mock('@/utils/eventEmitter', () => ({
  emitter: { emit: (...args: unknown[]) => emitSpy(...args) },
}));

// =============================================================================
// Factories
// =============================================================================

const BASE_DATA: CatchUpCardData = {
  completedJobs: [],
  failedJobs: [],
  pendingDecision: undefined,
  trainingJobs: [],
  completedSteps: [],
  reasoning: [],
  proposedChanges: [],
};

function makePerTopic(overrides?: Partial<CatchUpTopicScore>[]): CatchUpTopicScore[] {
  const defaults: CatchUpTopicScore[] = [
    { topic: 'cooking', mean: 0.68, count: 25, status: 'good' },
    { topic: 'baking', mean: 0.52, count: 20, status: 'ok' },
    { topic: 'grilling', mean: 0.28, count: 15, status: 'bad' },
  ];
  if (!overrides) return defaults;
  return defaults.map((d, i) => ({ ...d, ...overrides[i] }));
}

function makeCompletedEvalJob(overrides: Partial<CatchUpCardData['completedJobs'][number]> = {}) {
  return {
    jobId: 'eval-001',
    averageScore: 0.64,
    completedAt: Date.now(),
    verdict: undefined,
    totalRows: 150,
    perTopic: makePerTopic(),
    iterationDelta: undefined,
    iterationNumber: undefined,
    rolloutModel: 'gpt-4o-mini',
    ...overrides,
  };
}

function makeTrainingJob(overrides: Partial<CatchUpTrainingJob> = {}): CatchUpTrainingJob {
  return {
    jobId: 'ft-001',
    baseModel: 'gpt-4o-mini',
    fineTunedModel: 'ft:gpt-4o-mini:abc123',
    status: 'completed',
    startedAt: Date.now() - 60_000,
    completedAt: Date.now(),
    epochs: 3,
    totalRows: 150,
    metrics: { trainReward: 0.72, validReward: 0.70, loss: 0.28, currentEpoch: 3, totalEpochs: 3 },
    perTopic: makePerTopic(),
    ...overrides,
  };
}

function makeProposedChanges() {
  return [
    { lever: 'grilling', description: 'Critical (0.28 from fine-tuned model) — review grader rubric', applied: false },
    { lever: 'baking', description: 'Below target (0.52 from fine-tuned model) — minor prompt adjustments', applied: false },
  ];
}

function makeCompletedSteps() {
  return [
    { step: 'topics', label: 'Topics configured (6 topics)' },
    { step: 'categorize', label: '150 records categorized' },
    { step: 'grader', label: 'Grader configured' },
  ];
}

// =============================================================================
// Header tests
// =============================================================================

describe('LucyCatchUpCard — header', () => {
  it('shows EVALUATION FAILED when there are failed eval jobs', () => {
    render(<LucyCatchUpCard data={{
      ...BASE_DATA,
      failedJobs: [{ jobId: 'fail-001', errorMessage: 'OOM', failedAt: Date.now() }],
    }} />);
    expect(screen.getByText(/EVALUATION FAILED/)).toBeInTheDocument();
    // "Error" appears as both badge and section label — verify at least one exists
    expect(screen.getAllByText('Error').length).toBeGreaterThanOrEqual(1);
  });

  it('shows TRAINING FAILED when training job failed', () => {
    render(<LucyCatchUpCard data={{
      ...BASE_DATA,
      trainingJobs: [makeTrainingJob({ status: 'failed', errorMessage: 'Insufficient credits' })],
    }} />);
    expect(screen.getByText(/TRAINING FAILED/)).toBeInTheDocument();
  });

  it('shows TRAINING IN PROGRESS when training is running', () => {
    render(<LucyCatchUpCard data={{
      ...BASE_DATA,
      trainingJobs: [makeTrainingJob({ status: 'running', fineTunedModel: undefined, completedAt: undefined })],
    }} />);
    expect(screen.getByText(/TRAINING IN PROGRESS/)).toBeInTheDocument();
  });

  it('shows WELCOME BACK with Training Done badge for completed training', () => {
    render(<LucyCatchUpCard data={{
      ...BASE_DATA,
      trainingJobs: [makeTrainingJob()],
      completedSteps: makeCompletedSteps(),
    }} />);
    expect(screen.getByText(/WELCOME BACK/)).toBeInTheDocument();
    expect(screen.getByText('Training Done')).toBeInTheDocument();
  });

  it('shows EVALUATION COMPLETE for completed eval without training', () => {
    render(<LucyCatchUpCard data={{
      ...BASE_DATA,
      completedJobs: [makeCompletedEvalJob()],
    }} />);
    expect(screen.getByText(/EVALUATION COMPLETE/)).toBeInTheDocument();
  });

  it('shows PENDING DECISION when awaiting user response', () => {
    render(<LucyCatchUpCard data={{
      ...BASE_DATA,
      pendingDecision: {
        iterationNumber: 2,
        proposedChanges: [{ lever: 'prompts', description: 'Refine system prompts', applied: false }],
        lastScore: 0.55,
      },
    }} />);
    expect(screen.getByText(/ITERATION 2.*PENDING DECISION/)).toBeInTheDocument();
  });

  it('shows generic WELCOME BACK for mid-pipeline with only completed steps', () => {
    render(<LucyCatchUpCard data={{
      ...BASE_DATA,
      completedSteps: makeCompletedSteps(),
    }} />);
    expect(screen.getByText(/WELCOME BACK/)).toBeInTheDocument();
  });
});

// =============================================================================
// Completed steps section
// =============================================================================

describe('LucyCatchUpCard — completed steps', () => {
  it('renders green checkmarks for each completed step', () => {
    const steps = makeCompletedSteps();
    render(<LucyCatchUpCard data={{ ...BASE_DATA, completedSteps: steps }} />);
    for (const s of steps) {
      expect(screen.getByText(s.label)).toBeInTheDocument();
    }
  });

  it('hides section when no steps completed', () => {
    render(<LucyCatchUpCard data={{
      ...BASE_DATA,
      completedJobs: [makeCompletedEvalJob()],
    }} />);
    expect(screen.queryByText('Topics configured')).not.toBeInTheDocument();
  });
});

// =============================================================================
// Score Matrix section
// =============================================================================

describe('LucyCatchUpCard — score matrix', () => {
  it('shows eval job score with model name', () => {
    render(<LucyCatchUpCard data={{
      ...BASE_DATA,
      completedJobs: [makeCompletedEvalJob({ averageScore: 0.65, rolloutModel: 'gpt-4o-mini' })],
    }} />);
    // Model name appears in score matrix + per-topic rows
    expect(screen.getAllByText('gpt-4o-mini').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('0.65')).toBeInTheDocument();
  });

  it('shows training job score with fine-tuned model name', () => {
    render(<LucyCatchUpCard data={{
      ...BASE_DATA,
      trainingJobs: [makeTrainingJob({ metrics: { trainReward: 0.72, validReward: 0.70, loss: 0.28, currentEpoch: 3, totalEpochs: 3 } })],
    }} />);
    // Fine-tuned model name appears in score matrix + per-topic rows
    expect(screen.getAllByText('ft:gpt-4o-mini:abc123').length).toBeGreaterThanOrEqual(1);
  });

  it('shows dash for training without metrics', () => {
    render(<LucyCatchUpCard data={{
      ...BASE_DATA,
      trainingJobs: [makeTrainingJob({ metrics: undefined })],
    }} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});

// =============================================================================
// Per-Topic section
// =============================================================================

describe('LucyCatchUpCard — per-topic', () => {
  it('renders topic headers with model rows underneath', () => {
    render(<LucyCatchUpCard data={{
      ...BASE_DATA,
      completedJobs: [makeCompletedEvalJob()],
    }} />);
    expect(screen.getByText('cooking')).toBeInTheDocument();
    expect(screen.getByText('baking')).toBeInTheDocument();
    expect(screen.getByText('grilling')).toBeInTheDocument();
  });

  it('shows both eval and training scores per topic', () => {
    render(<LucyCatchUpCard data={{
      ...BASE_DATA,
      completedJobs: [makeCompletedEvalJob()],
      trainingJobs: [makeTrainingJob()],
    }} />);
    // Both model names should appear under each topic
    const evalLabels = screen.getAllByText('gpt-4o-mini');
    const ftLabels = screen.getAllByText('ft:gpt-4o-mini:abc123');
    // One per topic (3 topics)
    expect(evalLabels.length).toBeGreaterThanOrEqual(3);
    expect(ftLabels.length).toBeGreaterThanOrEqual(3);
  });

  it('returns nothing when no jobs have per-topic data', () => {
    render(<LucyCatchUpCard data={{
      ...BASE_DATA,
      completedJobs: [makeCompletedEvalJob({ perTopic: undefined })],
    }} />);
    expect(screen.queryByText('Per-Topic')).not.toBeInTheDocument();
  });
});

// =============================================================================
// Cross-Model Insight
// =============================================================================

describe('LucyCatchUpCard — cross-model insight', () => {
  it('shows insight when eval + training both have scores', () => {
    render(<LucyCatchUpCard data={{
      ...BASE_DATA,
      completedJobs: [makeCompletedEvalJob({ averageScore: 0.65 })],
      trainingJobs: [makeTrainingJob({ metrics: { trainReward: 0.72, validReward: 0.72, loss: 0.28, currentEpoch: 3, totalEpochs: 3 } })],
    }} />);
    // Insight text mentions fine-tuning comparison
    expect(screen.getByText(/fine-tuning improved/i)).toBeInTheDocument();
  });

  it('hides insight when only one scored entry', () => {
    render(<LucyCatchUpCard data={{
      ...BASE_DATA,
      completedJobs: [makeCompletedEvalJob()],
    }} />);
    // Only one model — no cross-model comparison
    expect(screen.queryByText(/outperforms|underperforms/i)).not.toBeInTheDocument();
  });
});

// =============================================================================
// Proposed Changes section
// =============================================================================

describe('LucyCatchUpCard — proposed changes', () => {
  it('renders proposed changes from score-derived proposals', () => {
    render(<LucyCatchUpCard data={{
      ...BASE_DATA,
      completedJobs: [makeCompletedEvalJob()],
      proposedChanges: makeProposedChanges(),
    }} />);
    expect(screen.getByText(/Critical.*0.28.*review grader rubric/)).toBeInTheDocument();
    expect(screen.getByText(/Below target.*0.52.*prompt adjustments/)).toBeInTheDocument();
  });

  it('hides proposed changes section when empty', () => {
    render(<LucyCatchUpCard data={{
      ...BASE_DATA,
      completedJobs: [makeCompletedEvalJob()],
    }} />);
    expect(screen.queryByText('Proposed Changes')).not.toBeInTheDocument();
  });

  it('shows checkmark for applied changes', () => {
    render(<LucyCatchUpCard data={{
      ...BASE_DATA,
      completedJobs: [makeCompletedEvalJob()],
      proposedChanges: [{ lever: 'grilling', description: 'Regenerated examples', applied: true }],
    }} />);
    expect(screen.getByText('Regenerated examples')).toBeInTheDocument();
  });
});

// =============================================================================
// Training error box
// =============================================================================

describe('LucyCatchUpCard — training error', () => {
  it('shows error box for failed training', () => {
    render(<LucyCatchUpCard data={{
      ...BASE_DATA,
      trainingJobs: [makeTrainingJob({ status: 'failed', errorMessage: 'Insufficient credits' })],
    }} />);
    expect(screen.getByText('Insufficient credits')).toBeInTheDocument();
  });

  it('does not show error box for completed training', () => {
    render(<LucyCatchUpCard data={{
      ...BASE_DATA,
      trainingJobs: [makeTrainingJob()],
    }} />);
    expect(screen.queryByText('Error')).not.toBeInTheDocument();
  });
});

// =============================================================================
// Action buttons — the core coverage for all dataset states
// =============================================================================

describe('LucyCatchUpCard — action buttons', () => {
  beforeEach(() => {
    emitSpy.mockClear();
  });

  // ── Completed training with proposed changes ──
  it('shows Accept & Apply + Modify for completed training with proposals', () => {
    render(<LucyCatchUpCard data={{
      ...BASE_DATA,
      trainingJobs: [makeTrainingJob()],
      proposedChanges: makeProposedChanges(),
    }} />);
    expect(screen.getByText('Accept & Apply')).toBeInTheDocument();
    expect(screen.getByText('Modify Changes')).toBeInTheDocument();
    // No View Full Results (removed)
    expect(screen.queryByText('View Full Results')).not.toBeInTheDocument();
  });

  // ── Completed training without proposals ──
  it('shows no buttons for completed training without proposals', () => {
    render(<LucyCatchUpCard data={{
      ...BASE_DATA,
      trainingJobs: [makeTrainingJob()],
    }} />);
    expect(screen.queryByText('Accept & Apply')).not.toBeInTheDocument();
    expect(screen.queryByText('View Full Results')).not.toBeInTheDocument();
  });

  // ── Failed training ──
  it('shows Retry + Diagnose for failed training', () => {
    render(<LucyCatchUpCard data={{
      ...BASE_DATA,
      trainingJobs: [makeTrainingJob({ status: 'failed', errorMessage: 'OOM' })],
    }} />);
    expect(screen.getByText('Retry Training')).toBeInTheDocument();
    expect(screen.getByText('Diagnose')).toBeInTheDocument();
  });

  // ── Failed training with proposals → accept/modify + retry/diagnose ──
  it('shows Accept & Apply + Retry + Diagnose for failed training with proposals', () => {
    render(<LucyCatchUpCard data={{
      ...BASE_DATA,
      trainingJobs: [makeTrainingJob({ status: 'failed', errorMessage: 'OOM' })],
      proposedChanges: makeProposedChanges(),
    }} />);
    expect(screen.getByText('Accept & Apply')).toBeInTheDocument();
    expect(screen.getByText('Modify Changes')).toBeInTheDocument();
    expect(screen.getByText('Retry Training')).toBeInTheDocument();
    expect(screen.getByText('Diagnose')).toBeInTheDocument();
  });

  // ── Running training ──
  it('shows Check Progress for running training', () => {
    render(<LucyCatchUpCard data={{
      ...BASE_DATA,
      trainingJobs: [makeTrainingJob({ status: 'running', completedAt: undefined })],
    }} />);
    expect(screen.getByText('Check Progress')).toBeInTheDocument();
  });

  // ── Failed eval ──
  it('shows Retry + Diagnose for failed eval', () => {
    render(<LucyCatchUpCard data={{
      ...BASE_DATA,
      failedJobs: [{ jobId: 'fail-001', errorMessage: 'Timeout', failedAt: Date.now() }],
    }} />);
    expect(screen.getByText('Retry Eval')).toBeInTheDocument();
    expect(screen.getByText('Diagnose')).toBeInTheDocument();
  });

  // ── Completed eval without proposals ──
  it('shows View Analysis for completed eval without proposals', () => {
    render(<LucyCatchUpCard data={{
      ...BASE_DATA,
      completedJobs: [makeCompletedEvalJob()],
    }} />);
    expect(screen.getByText('View Analysis')).toBeInTheDocument();
  });

  // ── Completed eval with proposals ──
  it('shows Accept & Apply + Modify for completed eval with proposals', () => {
    render(<LucyCatchUpCard data={{
      ...BASE_DATA,
      completedJobs: [makeCompletedEvalJob()],
      proposedChanges: makeProposedChanges(),
    }} />);
    expect(screen.getByText('Accept & Apply')).toBeInTheDocument();
    expect(screen.getByText('Modify Changes')).toBeInTheDocument();
    // View Analysis suppressed when proposals present
    expect(screen.queryByText('View Analysis')).not.toBeInTheDocument();
  });

  // ── Healthy eval → Skip to Training option ──
  it('shows Skip to Training for healthy eval (score ≥ 0.7)', () => {
    render(<LucyCatchUpCard data={{
      ...BASE_DATA,
      completedJobs: [makeCompletedEvalJob({ averageScore: 0.75 })],
    }} />);
    expect(screen.getByText('Skip to Training')).toBeInTheDocument();
  });

  // ── Pending iteration decision ──
  it('shows Accept & Apply + Modify for pending decision', () => {
    render(<LucyCatchUpCard data={{
      ...BASE_DATA,
      pendingDecision: {
        iterationNumber: 1,
        proposedChanges: [{ lever: 'prompts', description: 'Fix prompts', applied: false }],
        lastScore: 0.55,
      },
    }} />);
    expect(screen.getByText('Accept & Apply')).toBeInTheDocument();
    expect(screen.getByText('Modify Changes')).toBeInTheDocument();
  });

  // ── Mid-pipeline: completed steps only → Continue button ──
  it('shows Continue for mid-pipeline with only completed steps', () => {
    render(<LucyCatchUpCard data={{
      ...BASE_DATA,
      completedSteps: makeCompletedSteps(),
    }} />);
    expect(screen.getByText('Continue')).toBeInTheDocument();
  });

  // ── Button click emits prompt ──
  it('emits prompt when Accept & Apply is clicked', () => {
    render(<LucyCatchUpCard data={{
      ...BASE_DATA,
      completedJobs: [makeCompletedEvalJob()],
      proposedChanges: makeProposedChanges(),
    }} />);
    fireEvent.click(screen.getByText('Accept & Apply'));
    expect(emitSpy).toHaveBeenCalledWith('vllora_lucy_prompt', expect.objectContaining({ prompt: expect.stringContaining('apply') }));
  });

  it('shows "Response sent" after clicking a button', () => {
    render(<LucyCatchUpCard data={{
      ...BASE_DATA,
      completedSteps: makeCompletedSteps(),
    }} />);
    fireEvent.click(screen.getByText('Continue'));
    expect(screen.getByText('Response sent')).toBeInTheDocument();
    // Buttons should be hidden
    expect(screen.queryByText('Continue')).not.toBeInTheDocument();
  });
});

// =============================================================================
// Score color thresholds
// =============================================================================

describe('LucyCatchUpCard — score colors', () => {
  it('applies red color for scores below 0.5', () => {
    render(<LucyCatchUpCard data={{
      ...BASE_DATA,
      completedJobs: [makeCompletedEvalJob({ averageScore: 0.30 })],
    }} />);
    const scoreEl = screen.getByText('0.30');
    expect(scoreEl.className).toMatch(/red/);
  });

  it('applies amber color for scores between 0.5 and 0.65', () => {
    render(<LucyCatchUpCard data={{
      ...BASE_DATA,
      completedJobs: [makeCompletedEvalJob({ averageScore: 0.55 })],
    }} />);
    const scoreEl = screen.getByText('0.55');
    expect(scoreEl.className).toMatch(/amber/);
  });

  it('applies green color for scores at or above 0.65', () => {
    render(<LucyCatchUpCard data={{
      ...BASE_DATA,
      completedJobs: [makeCompletedEvalJob({ averageScore: 0.72 })],
    }} />);
    const scoreEl = screen.getByText('0.72');
    expect(scoreEl.className).toMatch(/emerald/);
  });
});
