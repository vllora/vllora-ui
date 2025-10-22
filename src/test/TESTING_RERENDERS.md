# Testing Re-renders in React

## The Question: How Do We Know if a Component Actually Re-rendered?

Great question! When testing React components, it's not enough to just check if the output is correct. We need to verify that our memoization is working by checking **if the component re-rendered or not**.

## The Problem with Naive Testing

### ❌ This Test Doesn't Work:

```typescript
it('does not re-render when messageStructure has same values', () => {
  const message = { span_id: 'run-123', type: 'run', children: [] };

  const { rerender, getByTestId } = render(
    <HierarchicalMessageSpanItem messageStructure={message} />
  );

  expect(getByTestId('run-run-123')).toBeInTheDocument(); // ✓ Passes

  const sameMessage = { span_id: 'run-123', type: 'run', children: [] };
  rerender(<HierarchicalMessageSpanItem messageStructure={sameMessage} />);

  expect(getByTestId('run-run-123')).toBeInTheDocument(); // ✓ Passes
});
```

**Why this fails to test re-renders:**
- `getByTestId('run-run-123')` will be in the document **whether it re-rendered or not**
- The output is the same, so we can't tell the difference!

## The Solution: Track Render Counts

We need to **count how many times the component renders**. Here's how:

### ✅ Proper Re-render Test:

```typescript
// 1. Setup a render counter
let renderCount = 0;

// 2. Mock the component to increment counter on each render
vi.mock('../run-wrapper', () => ({
  RunSpanMessage: vi.fn(({ runId, messages, level }) => {
    renderCount++; // Count this render!
    return (
      <div data-testid={`run-${runId}`}>
        Run: {runId}
      </div>
    );
  }),
}));

// 3. Test for NO re-render
it('does not re-render when messageStructure has same values', () => {
  const message = { span_id: 'run-123', type: 'run', children: [] };

  const { rerender } = render(
    <HierarchicalMessageSpanItem messageStructure={message} />
  );

  const firstRenderCount = renderCount;
  expect(firstRenderCount).toBe(1); // Rendered once initially

  // New object, SAME values
  const sameMessage = { span_id: 'run-123', type: 'run', children: [] };
  rerender(<HierarchicalMessageSpanItem messageStructure={sameMessage} />);

  // Key assertion: render count should NOT increase
  expect(renderCount).toBe(firstRenderCount); // Still 1! No re-render!
});

// 4. Test for YES re-render
it('re-renders when span_id changes', () => {
  const message = { span_id: 'run-123', type: 'run', children: [] };

  const { rerender } = render(
    <HierarchicalMessageSpanItem messageStructure={message} />
  );

  const firstRenderCount = renderCount;
  expect(firstRenderCount).toBe(1);

  // Different span_id
  const modifiedMessage = { span_id: 'run-456', type: 'run', children: [] };
  rerender(<HierarchicalMessageSpanItem messageStructure={modifiedMessage} />);

  // Key assertion: render count SHOULD increase
  expect(renderCount).toBe(firstRenderCount + 1); // 2! It re-rendered!
});
```

## How It Works: Visual Breakdown

### Scenario 1: Should NOT Re-render (Deep Comparison Works)

```
Initial State:
  renderCount = 0

Step 1: Initial render
  <HierarchicalMessageSpanItem messageStructure={{ span_id: 'run-123', ... }} />
  RunSpanMessage executes → renderCount++
  renderCount = 1 ✓

Step 2: Re-render with new object (same values)
  messageStructure = { span_id: 'run-123', ... } (NEW object, same values)

  HierarchicalMessageSpanItem's memo comparison:
    compareMessageStructure(prev, next)
    prev.span_id === 'run-123'
    next.span_id === 'run-123'
    ✓ Match! Return true (props are equal)

  React: "Props are equal, skip re-render"
  RunSpanMessage does NOT execute
  renderCount = 1 ✓ (No change!)

Assertion:
  expect(renderCount).toBe(1) ✓ PASSES
  → This proves memoization is working!
```

### Scenario 2: SHOULD Re-render (Values Changed)

```
Initial State:
  renderCount = 0

Step 1: Initial render
  <HierarchicalMessageSpanItem messageStructure={{ span_id: 'run-123', ... }} />
  RunSpanMessage executes → renderCount++
  renderCount = 1 ✓

Step 2: Re-render with different span_id
  messageStructure = { span_id: 'run-456', ... }

  HierarchicalMessageSpanItem's memo comparison:
    compareMessageStructure(prev, next)
    prev.span_id === 'run-123'
    next.span_id === 'run-456'
    ✗ No match! Return false (props changed)

  React: "Props changed, re-render!"
  RunSpanMessage executes → renderCount++
  renderCount = 2 ✓

Assertion:
  expect(renderCount).toBe(2) ✓ PASSES
  → This proves component updates when it should!
```

## What `rerender()` Does

```typescript
const { rerender } = render(<Component prop="value1" />);

// This simulates what happens when parent component updates:
rerender(<Component prop="value2" />);
```

**In a real app, this is equivalent to:**

```typescript
function Parent() {
  const [value, setValue] = useState("value1");

  // When setState is called:
  setValue("value2");

  // React re-renders Parent, which causes:
  return <Component prop={value} /> // Now with value2
}
```

## Key Insights

1. **Same Output ≠ No Re-render**
   - Component can re-render but produce same output
   - We need to track execution, not just output

2. **Render Counter is Essential**
   - Only way to definitively know if component function was called
   - Increment counter inside component body

3. **Test Both Cases**
   - Should NOT re-render (memoization works)
   - SHOULD re-render (detects actual changes)

## Common Mistakes

### ❌ Mistake 1: Only checking output
```typescript
// This doesn't verify re-rendering behavior
expect(getByTestId('element')).toBeInTheDocument();
```

### ✅ Fix: Check render count
```typescript
expect(renderCount).toBe(expectedCount);
```

### ❌ Mistake 2: Not resetting counter
```typescript
// Counter keeps increasing across tests, tests fail!
```

### ✅ Fix: Reset in beforeEach
```typescript
beforeEach(() => {
  renderCount = 0;
});
```

### ❌ Mistake 3: Forgetting that memoization prevents re-render
```typescript
// This will fail if memo works correctly:
rerender(<Component prop={sameValue} />);
expect(renderCount).toBe(2); // ❌ It's still 1!
```

### ✅ Fix: Understand memo behavior
```typescript
rerender(<Component prop={sameValue} />);
expect(renderCount).toBe(1); // ✓ Correct! Memo prevented re-render
```

## Real-World Example from Our Tests

```typescript
it('does not re-render when messageStructure has same values but different reference', () => {
  const message = {
    span_id: 'run-123',
    type: 'run',
    children: [],
  };

  const { rerender } = render(
    <HierarchicalMessageSpanItem messageStructure={message} />
  );

  const firstRenderCount = renderCount;
  expect(firstRenderCount).toBe(1);

  // This is what happens in real app when:
  // messageHierarchies = useMemo(() => buildMessageHierarchyFromSpan(flattenSpans), [flattenSpans])
  // flattenSpans changes, creating NEW objects with same span_ids

  const sameMessage = {
    span_id: 'run-123',  // Same!
    type: 'run',         // Same!
    children: [],        // Same!
  };

  rerender(<HierarchicalMessageSpanItem messageStructure={sameMessage} />);

  // Without deep comparison: renderCount would be 2 (wasted re-render)
  // With deep comparison: renderCount stays 1 (optimized!)
  expect(renderCount).toBe(firstRenderCount); // ✓ No re-render!
});
```

## Summary

- ✅ **Use render counters** to track actual re-renders
- ✅ **Test both positive and negative cases** (should/shouldn't re-render)
- ✅ **Reset counters** between tests
- ✅ **Understand memo behavior** - same values = no re-render
- ❌ **Don't rely on output alone** to verify re-render behavior
