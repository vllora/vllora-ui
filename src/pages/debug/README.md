# Debug Console

The Debug Console provides a real-time hierarchical timeline view of your application's execution, displaying the relationships between **Threads**, **Runs**, and **Traces** (Spans).

## Overview

The debug page automatically constructs a hierarchical view from event streams, allowing you to:
- Monitor real-time activity across threads
- Inspect run details and performance metrics
- Drill down into individual trace spans
- Debug issues by examining the complete execution flow

## Architecture

### Hierarchy Structure

```
Thread (Conversation/Session)
  └── Run (Model Execution)
      └── Trace/Span (Individual Operations)
```

#### Thread
- Represents a conversation or session
- Contains multiple runs
- Tracks overall cost, tokens, and activity

#### Run
- Represents a single model execution or API call
- Contains multiple spans (traces)
- Includes model information, cost, token usage, and duration

#### Span (Trace)
- Represents an individual operation (e.g., model_call, api_invoke, tool_call)
- Contains detailed attributes and timing information
- Lowest level of granularity

## File Structure

```
src/pages/debug/
├── index.tsx                  # Main debug page component
├── README.md                  # This file
└── (legacy components)        # Old event-level view components

src/hooks/events/
├── useDebugTimeline.ts        # Hook for constructing Thread→Run→Span hierarchy
└── useDebugEvents.ts          # Legacy event-level hook (deprecated)

src/components/debug/
├── HierarchicalTimeline.tsx   # Main timeline component with Thread/Run/Span items
├── EventItem.tsx              # Legacy event item (deprecated)
├── EventTimeline.tsx          # Legacy event timeline (deprecated)
└── FilterBar.tsx              # Legacy filter bar (deprecated)
```

## How It Works

### Event Processing Flow

1. **Event Subscription**
   - `useDebugTimeline` hook subscribes to all project events via `ProjectEventsConsumer`
   - Events are processed in real-time as they arrive

2. **Hierarchy Construction**
   The hook processes different event types to build the hierarchy:

   **Thread Events:**
   ```typescript
   // Custom event with name='thread_event'
   {
     type: 'Custom',
     name: 'thread_event',
     thread_id: '...',
     value: ThreadEventValue // Contains thread info
   }
   ```

   **Run Events:**
   - `model_start`: Creates a run with model information
   - `span_end`: Creates/updates run from span data
   - Any event with `run_id` + `thread_id`: Creates basic run

   **Span Events:**
   ```typescript
   // Custom event with name='span_end'
   {
     type: 'Custom',
     name: 'span_end',
     thread_id: '...',
     run_id: '...',
     value: {
       span: LangDBEventSpan // Contains span data
     }
   }
   ```

3. **State Management**
   - Threads stored in a `Map<string, DebugThread>`
   - Each thread contains an array of runs
   - Each run contains an array of spans
   - Sorted by `lastActivity` (most recent first)

### Data Flow

```
ProjectEventsProvider (SSE Stream)
          ↓
   subscribe('debug-timeline-events')
          ↓
   processEvent() - Constructs hierarchy
          ↓
   setThreads() - Updates state
          ↓
   HierarchicalTimeline - Renders UI
```

## Components

### DebugPage (`index.tsx`)

Main container component that:
- Wraps content in `ProjectEventsProvider`
- Uses `useDebugTimeline` hook
- Provides controls (Pause/Resume, Clear)
- Renders `HierarchicalTimeline`

**Key Features:**
- Pause/Resume: Control event processing
- Clear: Reset all threads/runs/spans
- Real-time updates: Automatically reflects new events

### HierarchicalTimeline Component

Renders the three-level hierarchy with expandable items.

#### ThreadItem
**Visual Indicators:**
- Icon: `MessageSquare` (Green)
- Border: None (top-level)

**Displays:**
- Thread title or ID (first 8 chars)
- Last activity timestamp
- Aggregate metrics:
  - Total runs count
  - Total spans count
  - Total cost ($)
  - Total tokens

**Expandable:** Shows all runs when expanded

#### RunItem
**Visual Indicators:**
- Icon: `PlayCircle` (Blue)
- Border: Blue left border (2px)
- Indentation: 16px (ml-4)

**Displays:**
- Run ID (first 8 chars)
- Model name
- Metrics:
  - Span count
  - Cost ($)
  - Token count
  - Duration (ms or s)

**Expandable:** Shows all spans when expanded

#### SpanItem
**Visual Indicators:**
- Icon: `Zap` (Purple)
- Border: Purple left border (2px)
- Indentation: 32px (ml-8)

**Displays:**
- Span ID (first 8 chars)
- Operation name (e.g., `model_call`, `api_invoke`)
- Duration

**Expandable:** Shows detailed JSON attributes

## Styling

### Color Scheme

The timeline uses a consistent color scheme to differentiate levels:

| Level  | Color  | Icon          | Purpose                    |
|--------|--------|---------------|----------------------------|
| Thread | Green  | MessageSquare | Top-level conversations    |
| Run    | Blue   | PlayCircle    | Model executions           |
| Span   | Purple | Zap           | Individual operations      |

Additional colors:
- **Cyan**: Token counts
- **Green**: Cost amounts
- **Muted**: Timestamps, IDs

### Layout

```
Thread ───────────────────────────────────────────
│
├── Run ──────────────────────────────────────────
│   │
│   ├── Span ─────────────────────────────────────
│   ├── Span ─────────────────────────────────────
│   └── Span ─────────────────────────────────────
│
└── Run ──────────────────────────────────────────
    │
    ├── Span ─────────────────────────────────────
    └── Span ─────────────────────────────────────
```

### Indentation System

- **Threads**: No indentation (0px)
- **Runs**: Left border + 16px padding (ml-4 pl-4)
- **Spans**: Left border + 32px padding (ml-8 pl-4)

### Interactive States

- **Hover**: `hover:bg-accent/5` - Subtle background highlight
- **Expanded**: Shows child items with collapse icon
- **Collapsed**: Hides child items with expand icon
- **Empty**: Shows "No threads to display" message

## Data Models

### DebugThread
```typescript
interface DebugThread extends Thread {
  runs: DebugRun[];           // All runs in this thread
  lastActivity: number;       // Timestamp of last update
}
```

### DebugRun
```typescript
interface DebugRun extends RunDTO {
  spans: Span[];              // All spans in this run
  lastActivity: number;       // Timestamp of last update
}
```

### Key Fields

**Thread:**
- `id`: Unique thread identifier
- `title`: Thread title (if available)
- `project_id`: Associated project
- `model_name`: Primary model used
- `cost`, `input_tokens`, `output_tokens`: Aggregate metrics

**Run (RunDTO):**
- `run_id`: Unique run identifier
- `thread_ids`: Parent thread IDs
- `used_models`: Models used in this run
- `request_models`: Models requested
- `cost`, `input_tokens`, `output_tokens`: Run metrics
- `start_time_us`, `finish_time_us`: Timing in microseconds
- `errors`: Array of error messages

**Span:**
- `span_id`: Unique span identifier
- `trace_id`: Associated trace ID
- `run_id`: Parent run ID
- `thread_id`: Parent thread ID
- `parent_span_id`: Parent span (if nested)
- `operation_name`: Type of operation
- `start_time_us`, `finish_time_us`: Timing in microseconds
- `attribute`: Operation-specific attributes
- `child_attribute`: Nested operation attributes

## Event Types Handled

### Custom Events
1. **thread_event**: Creates/updates threads
2. **span_end**: Creates/updates spans and their parent runs
3. **model_start**: Creates runs with model information

### Standard Events
Any event with `run_id` and `thread_id` creates a basic run entry.

## Utilities

### Time Formatting

**formatTime(timestamp: number)**
- Formats: `HH:MM:SS.mmm`
- Example: `14:32:45.123`

**formatDuration(startUs: number, endUs: number)**
- Short duration: `{ms}ms` (e.g., `250ms`)
- Long duration: `{s}s` (e.g., `1.45s`)

### Sorting

- Threads: Sorted by `lastActivity` (descending)
- Runs: Sorted by insertion order (newest first)
- Spans: Sorted by `start_time_us` (ascending - chronological)

## Performance Considerations

### Memory Management
- No artificial limits on threads/runs/spans
- Old threads naturally scroll out of view
- Use "Clear" button to reset when needed

### Update Optimization
- Immutable state updates prevent unnecessary re-renders
- Map-based storage for O(1) thread lookups
- Sorted arrays maintained incrementally

### Pause/Resume
- Paused events stored separately
- Batch processing when resumed
- Prevents UI blocking during high event volume

## Usage Examples

### Normal Flow

1. Navigate to `/debug` page
2. Events automatically start streaming
3. Click any thread to expand and see runs
4. Click any run to see spans
5. Click any span to see detailed attributes

### Debugging Workflow

1. **Identify Issue**
   - Look for threads with errors
   - Check cost/token anomalies
   - Review duration outliers

2. **Drill Down**
   - Expand thread to see all runs
   - Expand run to see all spans
   - Expand span to see attributes

3. **Analyze**
   - Compare run durations
   - Check model usage patterns
   - Inspect span attributes for errors

### Pause for Inspection

1. Click "Pause" to stop updates
2. Examine current state without interference
3. Paused event count shows in Resume button
4. Click "Resume" to process buffered events

## Troubleshooting

### No Threads Showing

**Possible Causes:**
- No project selected
- No activity in selected project
- Events not being emitted

**Solutions:**
- Ensure project is selected
- Trigger some activity (e.g., chat message)
- Check browser console for errors

### Missing Runs or Spans

**Possible Causes:**
- Events filtered out by `skipThisSpan()`
- Events missing required IDs
- Event processing errors

**Solutions:**
- Check event structure in browser console
- Verify `thread_id` and `run_id` are present
- Review `skipThisSpan()` logic in utils

### Performance Issues

**Possible Causes:**
- Too many threads/runs/spans
- High event volume
- Large span attributes

**Solutions:**
- Use "Clear" button to reset
- Use "Pause" during high volume
- Consider filtering at source

## Future Enhancements

Potential improvements for the debug console:

- [ ] Search/filter threads by ID, model, or content
- [ ] Export timeline data to JSON
- [ ] Metrics visualization (charts, graphs)
- [ ] Event replay functionality
- [ ] Diff view for comparing runs
- [ ] Real-time metrics dashboard
- [ ] Custom event highlighting
- [ ] Span performance analytics
- [ ] Thread grouping by criteria
- [ ] Keyboard navigation shortcuts

## Related Files

- **Event DTOs**: `src/contexts/project-events/dto.tsx`
- **Event Utilities**: `src/contexts/project-events/util.tsx`
- **Type Definitions**: `src/types/common-type.ts`, `src/types/chat.ts`
- **Chat Window Context**: `src/contexts/ChatWindowContext.tsx` (similar hierarchy)
- **Trace Events Hook**: `src/hooks/events/useTraceEvents.ts`
- **Threads Events Hook**: `src/hooks/events/useThreadsEvents.ts`

## API Reference

### useDebugTimeline Hook

```typescript
const {
  threads,      // DebugThread[] - Sorted array of threads
  isPaused,     // boolean - Current pause state
  pausedCount,  // number - Count of buffered events
  pause,        // () => void - Pause event processing
  resume,       // () => void - Resume and process buffered events
  clear,        // () => void - Clear all threads/runs/spans
} = useDebugTimeline({
  projectId: string  // Required: Current project ID
});
```

### Component Props

**HierarchicalTimeline:**
```typescript
interface HierarchicalTimelineProps {
  threads: DebugThread[];  // Array of threads to display
}
```

## Contributing

When modifying the debug console:

1. **Adding New Event Types**: Update `processEvent()` in `useDebugTimeline.ts`
2. **Changing Display**: Modify components in `HierarchicalTimeline.tsx`
3. **Adding Metrics**: Update data models and calculation logic
4. **Styling Changes**: Follow existing color scheme and indentation patterns
5. **Performance**: Test with high event volumes, use React DevTools Profiler

## License

Part of the Ellora UI project.
