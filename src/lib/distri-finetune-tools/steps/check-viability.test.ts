/**
 * check_viability tool tests
 *
 * Tests the task viability pre-check tool that determines whether
 * the base model can produce meaningful output for the task.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkViabilityHandler } from './check-viability';
import type { CheckViabilityResult } from '../types';

// =============================================================================
// Mocks
// =============================================================================

// Mock runGraderTest — the core dependency (avoids needing full API mock chain)
const mockRunGraderTest = vi.fn();
vi.mock('./test-grader', () => ({
  runGraderTest: (...args: unknown[]) => mockRunGraderTest(...args),
}));

// Mock service registry
const mockGetWorkflow = vi.fn();
const mockGetRecords = vi.fn();
vi.mock('@/services/service-registry', () => ({
  workflowService: {
    get: (...args: unknown[]) => mockGetWorkflow(...args),
  },
  recordService: {
    getByDatasetId: (...args: unknown[]) => mockGetRecords(...args),
  },
}));

// =============================================================================
// Helpers
// =============================================================================

function makeWorkflow(step: string, workflowId = 'ds-001') {
  return { id: 'wf-001', workflowId, currentStep: step };
}

function makeGraderResult(avgScore: number, sampleSize = 5) {
  return {
    success: true,
    test_results: {
      sample_size: sampleSize,
      average_score: avgScore,
      results: Array.from({ length: sampleSize }, (_, i) => ({
        record_id: `row-${i}`,
        row_index: i,
        score: avgScore,
        reason: 'Test reason',
        status: 'completed',
      })),
      evaluation_run_id: 'eval-run-001',
      grader_type: 'js' as const,
    },
  };
}

function makeRecords(count: number) {
  return Array.from({ length: count }, (_, i) => ({ id: `rec-${i}` }));
}

// =============================================================================
// Tests
// =============================================================================

describe('check_viability handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetRecords.mockResolvedValue(makeRecords(20));
  });

  // ---------------------------------------------------------------------------
  // Input validation
  // ---------------------------------------------------------------------------

  it('rejects missing workflow_id', async () => {
    const result = await checkViabilityHandler({}) as CheckViabilityResult;
    expect(result.success).toBe(false);
    expect(result.error).toContain('workflow_id');
  });

  it('rejects non-string workflow_id', async () => {
    const result = await checkViabilityHandler({ workflow_id: 123 }) as CheckViabilityResult;
    expect(result.success).toBe(false);
    expect(result.error).toContain('workflow_id');
  });

  it('rejects unknown workflow', async () => {
    mockGetWorkflow.mockResolvedValue(null);
    const result = await checkViabilityHandler({ workflow_id: 'wf-missing' }) as CheckViabilityResult;
    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });

  it('rejects workflow in early step (before grader configured)', async () => {
    mockGetWorkflow.mockResolvedValue(makeWorkflow('coverage_generation'));
    const result = await checkViabilityHandler({ workflow_id: 'wf-001' }) as CheckViabilityResult;
    expect(result.success).toBe(false);
    expect(result.error).toContain('grader');
  });

  it('rejects dataset with no records', async () => {
    mockGetWorkflow.mockResolvedValue(makeWorkflow('grader_config'));
    mockGetRecords.mockResolvedValue([]);
    const result = await checkViabilityHandler({ workflow_id: 'wf-001' }) as CheckViabilityResult;
    expect(result.success).toBe(false);
    expect(result.error).toContain('no records');
  });

  // ---------------------------------------------------------------------------
  // Viability classification
  // ---------------------------------------------------------------------------

  it('classifies as viable when mean >= 0.10', async () => {
    mockGetWorkflow.mockResolvedValue(makeWorkflow('grader_config'));
    mockRunGraderTest.mockResolvedValue(makeGraderResult(0.35));

    const result = await checkViabilityHandler({ workflow_id: 'wf-001' }) as CheckViabilityResult;

    expect(result.success).toBe(true);
    expect(result.viability?.verdict).toBe('viable');
    expect(result.viability?.mean_score).toBe(0.35);
    expect(result.viability?.recommendation).toContain('Safe to proceed');
  });

  it('classifies as marginal when mean is 0.05-0.10', async () => {
    mockGetWorkflow.mockResolvedValue(makeWorkflow('grader_config'));
    mockRunGraderTest.mockResolvedValue(makeGraderResult(0.07));

    const result = await checkViabilityHandler({ workflow_id: 'wf-001' }) as CheckViabilityResult;

    expect(result.success).toBe(true);
    expect(result.viability?.verdict).toBe('marginal');
    expect(result.viability?.recommendation).toContain('barely');
  });

  it('classifies as not_viable when mean < 0.05', async () => {
    mockGetWorkflow.mockResolvedValue(makeWorkflow('grader_config'));
    mockRunGraderTest.mockResolvedValue(makeGraderResult(0.02));

    const result = await checkViabilityHandler({ workflow_id: 'wf-001' }) as CheckViabilityResult;

    expect(result.success).toBe(true);
    expect(result.viability?.verdict).toBe('not_viable');
    expect(result.viability?.recommendation).toContain('completely fails');
  });

  it('classifies as viable at the exact threshold (0.10)', async () => {
    mockGetWorkflow.mockResolvedValue(makeWorkflow('grader_config'));
    mockRunGraderTest.mockResolvedValue(makeGraderResult(0.10));

    const result = await checkViabilityHandler({ workflow_id: 'wf-001' }) as CheckViabilityResult;

    expect(result.success).toBe(true);
    expect(result.viability?.verdict).toBe('viable');
  });

  it('classifies as marginal at the exact threshold (0.05)', async () => {
    mockGetWorkflow.mockResolvedValue(makeWorkflow('grader_config'));
    mockRunGraderTest.mockResolvedValue(makeGraderResult(0.05));

    const result = await checkViabilityHandler({ workflow_id: 'wf-001' }) as CheckViabilityResult;

    expect(result.success).toBe(true);
    expect(result.viability?.verdict).toBe('marginal');
  });

  // ---------------------------------------------------------------------------
  // Valid workflow steps
  // ---------------------------------------------------------------------------

  it('accepts workflow in grader_config step', async () => {
    mockGetWorkflow.mockResolvedValue(makeWorkflow('grader_config'));
    mockRunGraderTest.mockResolvedValue(makeGraderResult(0.50));

    const result = await checkViabilityHandler({ workflow_id: 'wf-001' }) as CheckViabilityResult;
    expect(result.success).toBe(true);
  });

  it('accepts workflow in dry_run step', async () => {
    mockGetWorkflow.mockResolvedValue(makeWorkflow('dry_run'));
    mockRunGraderTest.mockResolvedValue(makeGraderResult(0.50));

    const result = await checkViabilityHandler({ workflow_id: 'wf-001' }) as CheckViabilityResult;
    expect(result.success).toBe(true);
  });

  it('accepts workflow in training step', async () => {
    mockGetWorkflow.mockResolvedValue(makeWorkflow('training'));
    mockRunGraderTest.mockResolvedValue(makeGraderResult(0.50));

    const result = await checkViabilityHandler({ workflow_id: 'wf-001' }) as CheckViabilityResult;
    expect(result.success).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // Sample size
  // ---------------------------------------------------------------------------

  it('clamps sample_size to record count', async () => {
    mockGetWorkflow.mockResolvedValue(makeWorkflow('grader_config'));
    mockGetRecords.mockResolvedValue(makeRecords(3));
    mockRunGraderTest.mockResolvedValue(makeGraderResult(0.50, 3));

    await checkViabilityHandler({ workflow_id: 'wf-001', sample_size: 10 });

    expect(mockRunGraderTest).toHaveBeenCalledWith('ds-001', 3);
  });

  it('uses default sample_size of 5', async () => {
    mockGetWorkflow.mockResolvedValue(makeWorkflow('grader_config'));
    mockRunGraderTest.mockResolvedValue(makeGraderResult(0.50));

    await checkViabilityHandler({ workflow_id: 'wf-001' });

    expect(mockRunGraderTest).toHaveBeenCalledWith('ds-001', 5);
  });

  // ---------------------------------------------------------------------------
  // Error handling
  // ---------------------------------------------------------------------------

  it('handles runGraderTest failure gracefully', async () => {
    mockGetWorkflow.mockResolvedValue(makeWorkflow('grader_config'));
    mockRunGraderTest.mockResolvedValue({ success: false, error: 'Grader must be configured first' });

    const result = await checkViabilityHandler({ workflow_id: 'wf-001' }) as CheckViabilityResult;

    expect(result.success).toBe(false);
    expect(result.error).toContain('Grader must be configured');
  });

  // ---------------------------------------------------------------------------
  // Result shape
  // ---------------------------------------------------------------------------

  it('returns complete viability result with all fields', async () => {
    mockGetWorkflow.mockResolvedValue(makeWorkflow('grader_config'));
    mockRunGraderTest.mockResolvedValue(makeGraderResult(0.50, 5));

    const result = await checkViabilityHandler({ workflow_id: 'wf-001' }) as CheckViabilityResult;

    expect(result.success).toBe(true);
    expect(result.viability).toBeDefined();
    expect(result.viability!.verdict).toBe('viable');
    expect(result.viability!.mean_score).toBe(0.50);
    expect(result.viability!.sample_size).toBe(5);
    expect(result.viability!.scored_count).toBe(5);
    expect(result.viability!.per_record).toHaveLength(5);
    expect(result.viability!.evaluation_run_id).toBe('eval-run-001');
    expect(result.viability!.recommendation).toBeTruthy();
  });
});
