/**
 * LucyAnalyzeEvalRenderer tests
 *
 * Verifies that the evaluation analysis card renders correctly
 * for different evaluation scenarios (healthy, warning, critical, stalled, error).
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LucyAnalyzeEvalRenderer } from './LucyAnalyzeEvalRenderer';
import { EVAL_SCENARIOS } from '@/test/fixtures/eval-scenarios';
import type { ToolCall } from '@distri/core';
import type { ToolCallState } from '@distri/react';

// =============================================================================
// Helpers
// =============================================================================

function makeToolCall(name = 'analyze_evaluation'): ToolCall {
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
    tool_name: 'analyze_evaluation',
    input: {},
    result: JSON.stringify(result),
    status,
  } as unknown as ToolCallState;
}

// =============================================================================
// Tests
// =============================================================================

describe('LucyAnalyzeEvalRenderer', () => {
  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  it('shows loading spinner when running', () => {
    render(
      <LucyAnalyzeEvalRenderer
        toolCall={makeToolCall()}
        state={{ status: 'running' } as ToolCallState}
      />,
    );
    expect(screen.getByText('Analyzing evaluation results...')).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Error states
  // ---------------------------------------------------------------------------

  it('shows error when state has error', () => {
    render(
      <LucyAnalyzeEvalRenderer
        toolCall={makeToolCall()}
        state={{ error: 'Something broke', status: 'error' } as ToolCallState}
      />,
    );
    expect(screen.getByText('Something broke')).toBeInTheDocument();
  });

  it('shows error for failed analysis result', () => {
    render(
      <LucyAnalyzeEvalRenderer
        toolCall={makeToolCall()}
        state={makeState(EVAL_SCENARIOS.error)}
      />,
    );
    expect(screen.getByText('Evaluation run not found')).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Healthy scenario
  // ---------------------------------------------------------------------------

  it('renders healthy evaluation card', () => {
    render(
      <LucyAnalyzeEvalRenderer
        toolCall={makeToolCall()}
        state={makeState(EVAL_SCENARIOS.healthy)}
      />,
    );

    expect(screen.getByText('Evaluation Analysis')).toBeInTheDocument();
    expect(screen.getByText('Healthy')).toBeInTheDocument();
    expect(screen.getByText('Ready to Train')).toBeInTheDocument();
  });

  it('shows per-topic breakdown for healthy scenario', () => {
    render(
      <LucyAnalyzeEvalRenderer
        toolCall={makeToolCall()}
        state={makeState(EVAL_SCENARIOS.healthy)}
      />,
    );

    expect(screen.getByText('Pins')).toBeInTheDocument();
    expect(screen.getByText('Forks')).toBeInTheDocument();
    expect(screen.getByText('Combos')).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Warning scenario
  // ---------------------------------------------------------------------------

  it('renders warning evaluation card', () => {
    render(
      <LucyAnalyzeEvalRenderer
        toolCall={makeToolCall()}
        state={makeState(EVAL_SCENARIOS.warning)}
      />,
    );

    expect(screen.getByText('Warning')).toBeInTheDocument();
    expect(screen.getByText('Iterate')).toBeInTheDocument();
  });

  it('shows recommendations for warning scenario', () => {
    render(
      <LucyAnalyzeEvalRenderer
        toolCall={makeToolCall()}
        state={makeState(EVAL_SCENARIOS.warning)}
      />,
    );

    expect(screen.getByText('Recommendations')).toBeInTheDocument();
    expect(screen.getByText('Regenerate Combos data with simpler prompts')).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Critical scenario
  // ---------------------------------------------------------------------------

  it('renders critical evaluation card with grader warning', () => {
    render(
      <LucyAnalyzeEvalRenderer
        toolCall={makeToolCall()}
        state={makeState(EVAL_SCENARIOS.critical)}
      />,
    );

    expect(screen.getByText('Critical')).toBeInTheDocument();
    expect(screen.getByText('Escalate')).toBeInTheDocument();
    expect(screen.getByText('Grader issues detected')).toBeInTheDocument();
  });

  it('shows escalation for critical level >= 3', () => {
    render(
      <LucyAnalyzeEvalRenderer
        toolCall={makeToolCall()}
        state={makeState(EVAL_SCENARIOS.critical)}
      />,
    );

    // Escalation level 4, description contains "binary scores"
    expect(screen.getByText(/L4:.*binary scores/i)).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Stalled scenario
  // ---------------------------------------------------------------------------

  it('renders stalled evaluation with iteration comparison', () => {
    render(
      <LucyAnalyzeEvalRenderer
        toolCall={makeToolCall()}
        state={makeState(EVAL_SCENARIOS.stalled)}
      />,
    );

    // Iteration #3 with delta
    expect(screen.getByText(/Iter #3/)).toBeInTheDocument();
    // Stall count warning (>= 2)
    expect(screen.getByText(/3 stalled/)).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------
  // Fallback
  // ---------------------------------------------------------------------------

  it('falls back to SimpleFallbackRenderer when no result', () => {
    render(
      <LucyAnalyzeEvalRenderer
        toolCall={makeToolCall()}
        state={{ status: 'completed' } as ToolCallState}
      />,
    );

    // SimpleFallbackRenderer shows the tool name
    expect(screen.getByText('analyze_evaluation')).toBeInTheDocument();
  });
});
