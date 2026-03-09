/**
 * LucyAnalyzeTrainingRenderer tests
 *
 * Verifies that the training analysis card renders correctly
 * for different training scenarios (improving, overfitting, noLearning, error).
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LucyAnalyzeTrainingRenderer } from './LucyAnalyzeTrainingRenderer';
import { TRAINING_SCENARIOS } from '@/test/fixtures/training-scenarios';
import type { ToolCall } from '@distri/core';
import type { ToolCallState } from '@distri/react';

// =============================================================================
// Helpers
// =============================================================================

function makeToolCall(name = 'analyze_training'): ToolCall {
  return {
    id: 'tc-001',
    tool_call_id: 'tc-001',
    tool_name: name,
    input: { workflow_id: 'wf-001' },
  } as unknown as ToolCall;
}

function makeState(result: unknown, status = 'completed'): ToolCallState {
  return {
    tool_call_id: 'tc-001',
    tool_name: 'analyze_training',
    input: {},
    result: JSON.stringify(result),
    status,
  } as unknown as ToolCallState;
}

// =============================================================================
// Tests
// =============================================================================

describe('LucyAnalyzeTrainingRenderer', () => {
  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  it('shows loading spinner when running', () => {
    render(
      <LucyAnalyzeTrainingRenderer
        toolCall={makeToolCall()}
        state={{ status: 'running' } as unknown as ToolCallState}
      />,
    );
    expect(screen.getByText('Analyzing training results...')).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Error states
  // ---------------------------------------------------------------------------

  it('shows error when state has error', () => {
    render(
      <LucyAnalyzeTrainingRenderer
        toolCall={makeToolCall()}
        state={{ error: 'Job crashed', status: 'error' } as unknown as ToolCallState}
      />,
    );
    expect(screen.getByText('Job crashed')).toBeInTheDocument();
  });

  it('shows error for failed training result', () => {
    render(
      <LucyAnalyzeTrainingRenderer
        toolCall={makeToolCall()}
        state={makeState(TRAINING_SCENARIOS.error)}
      />,
    );
    expect(screen.getByText('Training job failed: insufficient credits')).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Improving scenario
  // ---------------------------------------------------------------------------

  it('renders improving training card', () => {
    render(
      <LucyAnalyzeTrainingRenderer
        toolCall={makeToolCall()}
        state={makeState(TRAINING_SCENARIOS.improving)}
      />,
    );

    expect(screen.getByText('Training Analysis')).toBeInTheDocument();
    // Multiple "Improving" badges (header + per-topic rows)
    expect(screen.getAllByText('Improving').length).toBeGreaterThan(0);
    expect(screen.getByText('Run Post-Training Eval')).toBeInTheDocument();
  });

  it('shows per-topic rows for improving scenario', () => {
    render(
      <LucyAnalyzeTrainingRenderer
        toolCall={makeToolCall()}
        state={makeState(TRAINING_SCENARIOS.improving)}
      />,
    );

    expect(screen.getByText('Pins')).toBeInTheDocument();
    expect(screen.getByText('Forks')).toBeInTheDocument();
    expect(screen.getByText('Combos')).toBeInTheDocument();
  });

  it('shows epoch count for improving scenario', () => {
    render(
      <LucyAnalyzeTrainingRenderer
        toolCall={makeToolCall()}
        state={makeState(TRAINING_SCENARIOS.improving)}
      />,
    );

    expect(screen.getByText(/3 epochs/)).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Overfitting scenario
  // ---------------------------------------------------------------------------

  it('renders overfitting training card', () => {
    render(
      <LucyAnalyzeTrainingRenderer
        toolCall={makeToolCall()}
        state={makeState(TRAINING_SCENARIOS.overfitting)}
      />,
    );

    expect(screen.getAllByText('Overfitting').length).toBeGreaterThan(0);
    expect(screen.getByText('Retrain')).toBeInTheDocument();
  });

  it('shows recommendations for overfitting scenario', () => {
    render(
      <LucyAnalyzeTrainingRenderer
        toolCall={makeToolCall()}
        state={makeState(TRAINING_SCENARIOS.overfitting)}
      />,
    );

    expect(screen.getByText('Recommendations')).toBeInTheDocument();
    expect(screen.getByText('Reduce to 2 epochs (peak performance)')).toBeInTheDocument();
  });

  it('shows peak epoch for overfitting', () => {
    render(
      <LucyAnalyzeTrainingRenderer
        toolCall={makeToolCall()}
        state={makeState(TRAINING_SCENARIOS.overfitting)}
      />,
    );

    // Peak at epoch 2
    expect(screen.getByText(/Peak at epoch 2/)).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // No learning scenario
  // ---------------------------------------------------------------------------

  it('renders no-learning training card', () => {
    render(
      <LucyAnalyzeTrainingRenderer
        toolCall={makeToolCall()}
        state={makeState(TRAINING_SCENARIOS.noLearning)}
      />,
    );

    expect(screen.getAllByText('No Learning').length).toBeGreaterThan(0);
    expect(screen.getByText('Improve Dataset')).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Fallback
  // ---------------------------------------------------------------------------

  it('falls back to SimpleFallbackRenderer when no result', () => {
    render(
      <LucyAnalyzeTrainingRenderer
        toolCall={makeToolCall()}
        state={{ status: 'completed' } as unknown as ToolCallState}
      />,
    );

    // SimpleFallbackRenderer shows the tool name
    expect(screen.getByText('analyze_training')).toBeInTheDocument();
  });
});
