import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useStableMessageHierarchies } from '../useStableMessageHierarchies';
import { MessageStructure } from '@/utils/message-structure-from-span';

describe('useStableMessageHierarchies', () => {
  it('returns the same reference when structure is unchanged', () => {
    const initialMessages: MessageStructure[] = [
      {
        span_id: 'span-1',
        type: 'run',
        children: [],
      },
      {
        span_id: 'span-2',
        type: 'task',
        children: [],
      },
    ];

    const { result, rerender } = renderHook(
      ({ messages }) => useStableMessageHierarchies(messages),
      {
        initialProps: { messages: initialMessages },
      }
    );

    const firstResult = result.current;

    // Create new array with same structure
    const newMessages: MessageStructure[] = [
      {
        span_id: 'span-1',
        type: 'run',
        children: [],
      },
      {
        span_id: 'span-2',
        type: 'task',
        children: [],
      },
    ];

    rerender({ messages: newMessages });

    // Should return the same reference
    expect(result.current).toBe(firstResult);
  });

  it('returns new reference when span_id changes', () => {
    const initialMessages: MessageStructure[] = [
      {
        span_id: 'span-1',
        type: 'run',
        children: [],
      },
    ];

    const { result, rerender } = renderHook(
      ({ messages }) => useStableMessageHierarchies(messages),
      {
        initialProps: { messages: initialMessages },
      }
    );

    const firstResult = result.current;

    const modifiedMessages: MessageStructure[] = [
      {
        span_id: 'span-1-modified',
        type: 'run',
        children: [],
      },
    ];

    rerender({ messages: modifiedMessages });

    // Should return a new reference
    expect(result.current).not.toBe(firstResult);
    expect(result.current).toBe(modifiedMessages);
  });

  it('returns new reference when type changes', () => {
    const initialMessages: MessageStructure[] = [
      {
        span_id: 'span-1',
        type: 'run',
        children: [],
      },
    ];

    const { result, rerender } = renderHook(
      ({ messages }) => useStableMessageHierarchies(messages),
      {
        initialProps: { messages: initialMessages },
      }
    );

    const firstResult = result.current;

    const modifiedMessages: MessageStructure[] = [
      {
        span_id: 'span-1',
        type: 'task',
        children: [],
      },
    ];

    rerender({ messages: modifiedMessages });

    // Should return a new reference
    expect(result.current).not.toBe(firstResult);
  });

  it('returns new reference when array length changes', () => {
    const initialMessages: MessageStructure[] = [
      {
        span_id: 'span-1',
        type: 'run',
        children: [],
      },
    ];

    const { result, rerender } = renderHook(
      ({ messages }) => useStableMessageHierarchies(messages),
      {
        initialProps: { messages: initialMessages },
      }
    );

    const firstResult = result.current;

    const extendedMessages: MessageStructure[] = [
      {
        span_id: 'span-1',
        type: 'run',
        children: [],
      },
      {
        span_id: 'span-2',
        type: 'task',
        children: [],
      },
    ];

    rerender({ messages: extendedMessages });

    // Should return a new reference
    expect(result.current).not.toBe(firstResult);
  });

  it('returns same reference when children structure is unchanged', () => {
    const initialMessages: MessageStructure[] = [
      {
        span_id: 'span-1',
        type: 'run',
        children: [
          {
            span_id: 'child-1',
            type: 'task',
            children: [],
          },
        ],
      },
    ];

    const { result, rerender } = renderHook(
      ({ messages }) => useStableMessageHierarchies(messages),
      {
        initialProps: { messages: initialMessages },
      }
    );

    const firstResult = result.current;

    // Create new array with same structure (including nested children)
    const newMessages: MessageStructure[] = [
      {
        span_id: 'span-1',
        type: 'run',
        children: [
          {
            span_id: 'child-1',
            type: 'task',
            children: [],
          },
        ],
      },
    ];

    rerender({ messages: newMessages });

    // Should return the same reference
    expect(result.current).toBe(firstResult);
  });

  it('returns new reference when nested children change', () => {
    const initialMessages: MessageStructure[] = [
      {
        span_id: 'span-1',
        type: 'run',
        children: [
          {
            span_id: 'child-1',
            type: 'task',
            children: [],
          },
        ],
      },
    ];

    const { result, rerender } = renderHook(
      ({ messages }) => useStableMessageHierarchies(messages),
      {
        initialProps: { messages: initialMessages },
      }
    );

    const firstResult = result.current;

    const modifiedMessages: MessageStructure[] = [
      {
        span_id: 'span-1',
        type: 'run',
        children: [
          {
            span_id: 'child-1-modified',
            type: 'task',
            children: [],
          },
        ],
      },
    ];

    rerender({ messages: modifiedMessages });

    // Should return a new reference
    expect(result.current).not.toBe(firstResult);
  });

  it('returns new reference when children array length changes', () => {
    const initialMessages: MessageStructure[] = [
      {
        span_id: 'span-1',
        type: 'run',
        children: [],
      },
    ];

    const { result, rerender } = renderHook(
      ({ messages }) => useStableMessageHierarchies(messages),
      {
        initialProps: { messages: initialMessages },
      }
    );

    const firstResult = result.current;

    const messagesWithChildren: MessageStructure[] = [
      {
        span_id: 'span-1',
        type: 'run',
        children: [
          {
            span_id: 'child-1',
            type: 'task',
            children: [],
          },
        ],
      },
    ];

    rerender({ messages: messagesWithChildren });

    // Should return a new reference
    expect(result.current).not.toBe(firstResult);
  });

  it('handles deeply nested structures correctly', () => {
    const initialMessages: MessageStructure[] = [
      {
        span_id: 'span-1',
        type: 'run',
        children: [
          {
            span_id: 'child-1',
            type: 'task',
            children: [
              {
                span_id: 'grandchild-1',
                type: 'agent',
                children: [],
              },
            ],
          },
        ],
      },
    ];

    const { result, rerender } = renderHook(
      ({ messages }) => useStableMessageHierarchies(messages),
      {
        initialProps: { messages: initialMessages },
      }
    );

    const firstResult = result.current;

    // Same structure, different reference
    const newMessages: MessageStructure[] = [
      {
        span_id: 'span-1',
        type: 'run',
        children: [
          {
            span_id: 'child-1',
            type: 'task',
            children: [
              {
                span_id: 'grandchild-1',
                type: 'agent',
                children: [],
              },
            ],
          },
        ],
      },
    ];

    rerender({ messages: newMessages });

    // Should return the same reference
    expect(result.current).toBe(firstResult);
  });

  it('returns new reference when deeply nested span changes', () => {
    const initialMessages: MessageStructure[] = [
      {
        span_id: 'span-1',
        type: 'run',
        children: [
          {
            span_id: 'child-1',
            type: 'task',
            children: [
              {
                span_id: 'grandchild-1',
                type: 'agent',
                children: [],
              },
            ],
          },
        ],
      },
    ];

    const { result, rerender } = renderHook(
      ({ messages }) => useStableMessageHierarchies(messages),
      {
        initialProps: { messages: initialMessages },
      }
    );

    const firstResult = result.current;

    const modifiedMessages: MessageStructure[] = [
      {
        span_id: 'span-1',
        type: 'run',
        children: [
          {
            span_id: 'child-1',
            type: 'task',
            children: [
              {
                span_id: 'grandchild-1-modified',
                type: 'agent',
                children: [],
              },
            ],
          },
        ],
      },
    ];

    rerender({ messages: modifiedMessages });

    // Should return a new reference
    expect(result.current).not.toBe(firstResult);
  });
});
