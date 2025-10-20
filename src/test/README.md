# Testing Setup

This project uses Vitest for testing React components and hooks.

## Installation

To run tests, you need to install the testing dependencies:

```bash
pnpm add -D vitest @testing-library/react @testing-library/jest-dom jsdom @vitest/ui
```

## Running Tests

```bash
# Run tests in watch mode
pnpm test

# Run tests once (for CI)
pnpm test:run

# Run tests with UI
pnpm test:ui
```

## Test Files

### Component Tests

- **ChatConversation** ([ChatConversation.test.tsx](../components/chat/conversation/__tests__/ChatConversation.test.tsx))
  - Tests memoization behavior
  - Verifies it only re-renders when `messageHierarchies` structure changes
  - Tests for proper rendering of messages and empty states

- **HierarchicalMessageSpanItem** ([HierarchicalMessageSpanItem.test.tsx](../components/chat/conversation/HierarchiMessageItem/__tests__/HierarchicalMessageSpanItem.test.tsx))
  - Tests deep comparison memoization
  - Verifies it only re-renders when its specific `messageStructure` changes
  - Tests routing to correct wrapper components (Run, Task, Agent, Tool, Raw)

### Hook Tests

- **useStableMessageHierarchies** ([useStableMessageHierarchies.test.ts](../hooks/__tests__/useStableMessageHierarchies.test.ts))
  - Tests stable reference maintenance
  - Verifies deep equality checking for MessageStructure arrays
  - Tests handling of nested children changes

## What the Tests Verify

These tests ensure the optimization goals are met:

1. **ChatConversation only re-renders when messageHierarchies structure changes**
   - Tests verify that re-renders don't happen with same message references
   - Tests verify re-renders DO happen when span_ids or structure changes

2. **Each HierarchicalMessageSpanItem only re-renders when its specific span updates**
   - Tests verify deep comparison works correctly
   - Tests verify memoization prevents unnecessary re-renders
   - Tests verify re-renders happen when actual data changes

3. **useStableMessageHierarchies maintains stable references**
   - Tests verify same reference is returned when structure is unchanged
   - Tests verify new reference is returned when structure changes
   - Tests work with deeply nested hierarchies

## Test Structure

All tests follow this pattern:

1. Setup mocks for dependencies
2. Render component/hook with initial props
3. Verify initial render
4. Re-render with modified props
5. Verify re-render behavior (should/shouldn't re-render)

## How Re-render Testing Works

For a detailed explanation of how we test re-renders and why render counters are necessary, see [TESTING_RERENDERS.md](./TESTING_RERENDERS.md).

**Quick summary:**
- We use a `renderCount` variable that increments each time a component renders
- Compare the count before and after `rerender()` to verify if component re-rendered
- Same output doesn't mean no re-render - we need to track actual function execution!

## Example Test

```typescript
let renderCount = 0;

it('does not re-render when messageStructure has same values', () => {
  const message = { span_id: 'run-123', type: 'run', children: [] };

  const { rerender } = render(
    <HierarchicalMessageSpanItem messageStructure={message} />
  );

  const firstRenderCount = renderCount;
  expect(firstRenderCount).toBe(1); // Rendered once

  // New object with same values
  const sameMessage = { span_id: 'run-123', type: 'run', children: [] };
  rerender(<HierarchicalMessageSpanItem messageStructure={sameMessage} />);

  // Should NOT re-render (renderCount stays the same)
  expect(renderCount).toBe(firstRenderCount); // Still 1!
});
```
