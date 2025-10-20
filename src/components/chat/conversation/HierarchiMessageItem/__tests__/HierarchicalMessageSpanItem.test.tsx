import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { HierarchicalMessageSpanItem } from '../index';
import { MessageStructure } from '@/utils/message-structure-from-span';

// Render counter to track how many times components render
let renderCount = 0;

// Mock the wrapper components with render tracking
vi.mock('../run-wrapper', () => ({
  RunSpanMessage: vi.fn(({ runId, messages, level }) => {
    renderCount++; // Track each render
    return (
      <div data-testid={`run-${runId}`} data-render-count={renderCount}>
        Run: {runId} (level {level})
        {messages.map((m: MessageStructure) => (
          <div key={m.span_id}>{m.span_id}</div>
        ))}
      </div>
    );
  }),
}));

vi.mock('../task-wrapper', () => ({
  TaskSpanMessage: vi.fn(({ spanId, messages, level }) => (
    <div data-testid={`task-${spanId}`}>
      Task: {spanId} (level {level})
    </div>
  )),
}));

vi.mock('../agent-wrapper', () => ({
  AgentSpanMessage: vi.fn(({ spanId, messages, level }) => (
    <div data-testid={`agent-${spanId}`}>
      Agent: {spanId} (level {level})
    </div>
  )),
}));

vi.mock('../tool-wrapper', () => ({
  ToolSpanMessage: vi.fn(({ spanId, messages, level }) => (
    <div data-testid={`tool-${spanId}`}>
      Tool: {spanId} (level {level})
    </div>
  )),
}));

vi.mock('../raw-span', () => ({
  RawSpanMessage: vi.fn(({ messageStructure, level }) => (
    <div data-testid={`raw-${messageStructure.span_id}`}>
      Raw: {messageStructure.span_id} (level {level})
    </div>
  )),
}));

describe('HierarchicalMessageSpanItem', () => {
  beforeEach(() => {
    renderCount = 0; // Reset counter before each test
  });

  it('renders RunSpanMessage for type "run"', () => {
    const message: MessageStructure = {
      span_id: 'run-123',
      type: 'run',
      children: [],
    };

    const { getByTestId } = render(
      <HierarchicalMessageSpanItem messageStructure={message} />
    );

    expect(getByTestId('run-run-123')).toBeInTheDocument();
  });

  it('renders TaskSpanMessage for type "task"', () => {
    const message: MessageStructure = {
      span_id: 'task-123',
      type: 'task',
      children: [],
    };

    const { getByTestId } = render(
      <HierarchicalMessageSpanItem messageStructure={message} />
    );

    expect(getByTestId('task-task-123')).toBeInTheDocument();
  });

  it('renders AgentSpanMessage for type "agent"', () => {
    const message: MessageStructure = {
      span_id: 'agent-123',
      type: 'agent',
      children: [],
    };

    const { getByTestId } = render(
      <HierarchicalMessageSpanItem messageStructure={message} />
    );

    expect(getByTestId('agent-agent-123')).toBeInTheDocument();
  });

  it('renders ToolSpanMessage for type "tools"', () => {
    const message: MessageStructure = {
      span_id: 'tool-123',
      type: 'tools',
      children: [],
    };

    const { getByTestId } = render(
      <HierarchicalMessageSpanItem messageStructure={message} />
    );

    expect(getByTestId('tool-tool-123')).toBeInTheDocument();
  });

  it('renders RawSpanMessage for unknown types', () => {
    const message: MessageStructure = {
      span_id: 'unknown-123',
      type: 'unknown',
      children: [],
    };

    const { getByTestId } = render(
      <HierarchicalMessageSpanItem messageStructure={message} />
    );

    expect(getByTestId('raw-unknown-123')).toBeInTheDocument();
  });

  it('does not re-render when same messageStructure is passed', () => {
    const message: MessageStructure = {
      span_id: 'run-123',
      type: 'run',
      children: [],
    };

    const { rerender, getByTestId } = render(
      <HierarchicalMessageSpanItem messageStructure={message} />
    );

    expect(getByTestId('run-run-123')).toBeInTheDocument();
    const firstRenderCount = renderCount;
    expect(firstRenderCount).toBe(1); // Should have rendered once

    // Re-render with SAME REFERENCE
    rerender(<HierarchicalMessageSpanItem messageStructure={message} />);

    // Should NOT re-render the child component (renderCount stays the same)
    expect(renderCount).toBe(firstRenderCount); // Still 1, no re-render!
  });

  it('does not re-render when messageStructure has same values but different reference', () => {
    const message: MessageStructure = {
      span_id: 'run-123',
      type: 'run',
      children: [],
    };

    const { rerender, getByTestId } = render(
      <HierarchicalMessageSpanItem messageStructure={message} />
    );

    expect(getByTestId('run-run-123')).toBeInTheDocument();
    const firstRenderCount = renderCount;
    expect(firstRenderCount).toBe(1); // Should have rendered once

    // Create new object with SAME VALUES (different reference)
    const sameMessage: MessageStructure = {
      span_id: 'run-123',
      type: 'run',
      children: [],
    };

    rerender(<HierarchicalMessageSpanItem messageStructure={sameMessage} />);

    // Should NOT re-render because deep comparison shows same values
    expect(renderCount).toBe(firstRenderCount); // Still 1, no re-render!
    // This proves our deep comparison memoization works!
  });

  it('re-renders when span_id changes', () => {
    const message: MessageStructure = {
      span_id: 'run-123',
      type: 'run',
      children: [],
    };

    const { rerender, getByTestId, queryByTestId } = render(
      <HierarchicalMessageSpanItem messageStructure={message} />
    );

    expect(getByTestId('run-run-123')).toBeInTheDocument();
    const firstRenderCount = renderCount;
    expect(firstRenderCount).toBe(1);

    const modifiedMessage: MessageStructure = {
      span_id: 'run-456',
      type: 'run',
      children: [],
    };

    rerender(<HierarchicalMessageSpanItem messageStructure={modifiedMessage} />);

    // Should re-render because span_id changed
    expect(renderCount).toBe(firstRenderCount + 1); // Rendered again!
    expect(queryByTestId('run-run-123')).not.toBeInTheDocument();
    expect(getByTestId('run-run-456')).toBeInTheDocument();
  });

  it('re-renders when children structure changes', () => {
    const message: MessageStructure = {
      span_id: 'run-123',
      type: 'run',
      children: [],
    };

    const { rerender, getByTestId } = render(
      <HierarchicalMessageSpanItem messageStructure={message} />
    );

    const firstRenderCount = renderCount;
    expect(firstRenderCount).toBe(1);

    const messageWithChildren: MessageStructure = {
      span_id: 'run-123',
      type: 'run',
      children: [
        { span_id: 'child-1', type: 'task', children: [] },
      ],
    };

    rerender(<HierarchicalMessageSpanItem messageStructure={messageWithChildren} />);

    // Should re-render because children array changed
    expect(renderCount).toBe(firstRenderCount + 1); // Rendered again!
    expect(getByTestId('run-run-123')).toBeInTheDocument();
    expect(getByTestId('run-run-123').textContent).toContain('child-1');
  });

  it('passes level prop correctly', () => {
    const message: MessageStructure = {
      span_id: 'task-123',
      type: 'task',
      children: [],
    };

    const { getByText } = render(
      <HierarchicalMessageSpanItem messageStructure={message} level={3} />
    );

    expect(getByText(/level 3/)).toBeInTheDocument();
  });
});
