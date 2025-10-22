# Chat Page Architecture Documentation

## Overview

The Chat Page is a hierarchical conversation interface that renders messages extracted from spans (observability traces). It supports nested conversations, collapsible sections, run tracking, and real-time updates through event streams.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Data Flow](#data-flow)
3. [Component Hierarchy](#component-hierarchy)
4. [Key Components](#key-components)
5. [State Management](#state-management)
6. [Message Extraction](#message-extraction)
7. [Rendering Strategy](#rendering-strategy)
8. [User Interactions](#user-interactions)
9. [Real-time Updates](#real-time-updates)
10. [Styling & Themes](#styling--themes)

---

## Architecture Overview

### High-Level Flow

```
┌─────────────────┐
│  Spans API      │ ──→ Fetch spans by thread_id
└─────────────────┘
         │
         ↓
┌─────────────────┐
│ buildSpanHierarchy │ ──→ Construct parent-child tree
└─────────────────┘
         │
         ↓
┌─────────────────┐
│ convertSpansToMessages │ ──→ Extract messages from model calls
└─────────────────┘
         │
         ↓
┌─────────────────┐
│ SpanWithMessages[] │ ──→ Hierarchical message structure
└─────────────────┘
         │
         ↓
┌─────────────────┐
│ ChatConversation │ ──→ Render UI with hierarchy
└─────────────────┘
```

---

## Data Flow

### 1. Initial Load

```typescript
// User navigates to chat page
ConversationWindow.tsx
  ↓
useEffect(() => refreshSpans())  // Fetch spans for thread
  ↓
ChatWindowContext.refreshSpans()
  ↓
listSpans({ threadIds: threadId })  // API call
  ↓
onSuccess: (spans) => {
  setConversationSpans(spans)        // Store flat list
  buildSpanHierarchy(spans)          // Build tree
  setHierarchicalSpans(hierarchy)    // Store tree
}
```

### 2. Message Derivation

```typescript
// Compute messages from spans
displayMessages = useMemo(() => {
  if (hierarchicalSpans.length === 0) return [];
  return convertSpansToMessages(hierarchicalSpans);
}, [hierarchicalSpans]);
```

**Key Points**:
- `displayMessages` is **computed**, not stored
- Automatically updates when `hierarchicalSpans` change
- Messages are **extracted** from spans, not fetched separately

### 3. Real-time Updates

```typescript
// New span arrives from event stream
addEventSpan(eventSpan)
  ↓
if (span.thread_id === currentThread) {
  setConversationSpans(prev => [...prev, span])  // Add to flat list
  setHierarchicalSpans(buildSpanHierarchy(updatedSpans))  // Rebuild tree
}
  ↓
displayMessages automatically recomputes  // Via useMemo
  ↓
UI updates with new messages
```

---

## Component Hierarchy

```
ConversationWindow
├── ConversationHeader
│   ├── Model selector
│   └── Refresh button
├── ConversationMetrics
│   └── Cost, tokens, duration
└── ChatConversation
    └── validMessages.map(spanWithMessages =>
        HierarchicalSpanItem
        ├── RunIdSeparator (optional)
        │   ├── Left gradient line
        │   ├── Run ID badge (clickable)
        │   └── Right gradient line
        ├── MessageItem[] (messages in this span)
        │   └── AiMessage / HumanMessage
        │       ├── Avatar / Provider icon
        │       ├── Message content
        │       ├── Tool calls
        │       └── MessageMetrics
        ├── Child conversation badge (if has children)
        │   ├── Expand/Collapse button
        │   └── Message count
        └── HierarchicalSpanItem[] (recursive children)
    )
```

---

## Key Components

### 1. **ChatWindowContext**

**File**: `src/contexts/ChatWindowContext.tsx`

**Purpose**: Central state management for chat page

**Key State**:
```typescript
{
  // Span data
  conversationSpans: Span[],        // Flat list from API
  hierarchicalSpans: Span[],        // Tree structure

  // Derived messages
  displayMessages: Message[],       // Computed from spans

  // Loading states
  isLoadingSpans: boolean,

  // UI state
  selectedSpanInfo: SelectedSpanInfo | null,
  openTraces: { run_id: string; tab: string }[],
  hoveredRunId: string | null,
}
```

**Key Functions**:
```typescript
refreshSpans()              // Fetch spans from API
addEventSpan(span)          // Handle real-time span events
fetchSpansByRunId(runId)    // Fetch detailed spans for a run
```

---

### 2. **ConversationWindow**

**File**: `src/components/chat/conversation/ConversationWindow.tsx`

**Purpose**: Main container for chat interface

**Responsibilities**:
- Fetch spans on mount/thread change
- Handle refresh actions
- Listen to conversation events
- Pass data to ChatConversation

**Key Logic**:
```typescript
useEffect(() => {
  if (threadId && !isDraft) {
    refreshSpans();  // Fetch spans for this thread
  }
}, [threadId, isDraft, refreshSpans]);
```

---

### 3. **ChatConversation**

**File**: `src/components/chat/conversation/ChatConversation.tsx`

**Purpose**: Renders the conversation list

**Key Features**:
- Deduplicates spans by `run_id`
- Shows empty state when no messages
- Renders loading indicator
- Provides scroll-to-bottom functionality

**Deduplication Logic**:
```typescript
const extractValidDisplayMessages = (messages: SpanWithMessages[]): SpanWithMessages[] => {
  // 1. Recursively collect spans with messages
  // 2. Deduplicate by run_id (keep span with most messages)
  // 3. Preserve original order
  // 4. Handle spans without run_id
}
```

---

### 4. **HierarchicalSpanItem**

**File**: `src/components/chat/conversation/HierarchicalMessageItem.tsx`

**Purpose**: Recursively renders spans with messages

**Key Features**:
- Renders messages in span
- Shows Run ID separator (optional)
- Collapsible child conversations
- Counts nested messages
- Respects indentation level

**Component Structure**:
```tsx
<div className="hierarchical-span">
  {/* Run ID separator */}
  {showRunIdHeader && <RunIdSeparator />}

  {/* Messages in this span */}
  {messages.map(msg => <MessageItem message={msg} />)}

  {/* Child conversation toggle */}
  {hasChildren && (
    <button onClick={() => setIsExpanded(!isExpanded)}>
      {isExpanded ? 'Collapse' : 'Expand'} Child Conversation
      ({nestedMessageCount} messages)
    </button>
  )}

  {/* Recursive children */}
  {hasChildren && isExpanded && (
    children.map(child =>
      <HierarchicalSpanItem spanWithMessages={child} />
    )
  )}
</div>
```

---

### 5. **RunIdSeparator**

**File**: `src/components/chat/conversation/RunIdSeparator.tsx`

**Purpose**: Visual separator showing run ID

**Design**:
```
━━━━━━━━  ▶ Run: a1b2c3d4  ━━━━━━━━
```

**Features**:
- Gradient lines on both sides
- Clickable badge in center
- Truncates run ID (8 chars)
- Hover effects

---

### 6. **MessageItem**

**File**: `src/components/chat/MessageItem.tsx`

**Purpose**: Routes to appropriate message component based on type

```typescript
export const MessageItem = ({ message }) => {
  switch (message.type) {
    case 'human':
      return <HumanMessage message={message} />;
    case 'ai':
    case 'assistant':
      return <AiMessage message={message} />;
    default:
      return <AiMessage message={message} />;
  }
};
```

---

### 7. **AiMessage**

**File**: `src/components/chat/messages/AiMessage.tsx`

**Purpose**: Renders AI assistant messages

**Features**:
- Provider icon (OpenAI, Anthropic, etc.)
- Model name display
- Timestamp with relative time
- Message content (markdown support)
- Tool calls display
- Metrics (cost, tokens, duration)
- Click to view trace
- Hover highlights related runs

**Key Logic**:
```typescript
const handleOpenTrace = () => {
  // Open trace panel
  setOpenTraces([{ run_id: runId, tab: 'trace' }]);
  // Fetch detailed spans
  fetchSpansByRunId(runId);
  // Expand sidebar
  setIsRightSidebarCollapsed(false);
};
```

---

### 8. **MessageMetrics**

**File**: `src/components/chat/messages/MessageMetrics.tsx`

**Purpose**: Displays message performance metrics

**Shows**:
- 💰 Cost (e.g., "$0.0012")
- ⚡ Duration (e.g., "1.2s")
- 🔥 Time to First Token (TTFT)
- 📊 Token usage (input/output)

---

## State Management

### Context Providers

```tsx
<ChatWindowProvider threadId={id} projectId={projectId}>
  <ThreadsProvider>
    <ConversationWindow />
  </ThreadsProvider>
</ChatWindowProvider>
```

### State Flow

```
User Action
    ↓
Event Handler
    ↓
Context State Update
    ↓
useMemo Recomputes
    ↓
Component Re-renders
```

**Example**: Refresh button clicked
```typescript
1. onClick={refreshSpans}
2. refreshSpans() calls listSpans() API
3. onSuccess updates conversationSpans
4. Triggers buildSpanHierarchy()
5. Updates hierarchicalSpans
6. displayMessages recomputes via useMemo
7. ChatConversation re-renders with new messages
```

---

## Message Extraction

### What is a "Model Call" Span?

Not all spans contain messages. Only **model call spans** do.

**isActualModelCall() Logic**:
```typescript
function isActualModelCall(span: Span): boolean {
  const operationName = span.operation_name;
  return !!(
    operationName &&
    !['api_invoke', 'cloud_api_invoke', 'model_call', 'tool_call', 'tools'].includes(operationName) &&
    !operationName.startsWith('guard_')
  );
}
```

**Examples**:
- ✅ `openai.chat.completions` → Model call
- ✅ `anthropic.messages.create` → Model call
- ❌ `api_invoke` → Wrapper span (skip)
- ❌ `guard_input` → Guard span (skip)

### Message Extraction Process

```typescript
function extractMessagesFromSpan(span: Span): Message[] {
  // 1. Parse request JSON
  const requestJson = tryParseJson(span.attribute.request);

  // 2. Extract messages array
  const requestMessages = requestJson?.messages || requestJson?.contents;

  // 3. Parse response JSON
  const outputJson = tryParseJson(span.attribute.output);

  // 4. Convert each request message
  const messages = requestMessages.map(msg => ({
    id: `${span.span_id}_msg_${index}`,
    role: msg.role,  // 'user' | 'assistant' | 'system'
    content: extractMessageContent(msg),
    timestamp: span.start_time_us / 1000,
    metrics: calculateSpanMetrics(span),
  }));

  // 5. Add assistant response message
  if (responseContent) {
    messages.push({
      id: `${span.span_id}_response`,
      role: 'assistant',
      content: responseContent,
      timestamp: span.finish_time_us / 1000,
    });
  }

  return messages;
}
```

### Content Extraction Strategy

**Priority order** for extracting message content:
1. `msg.content` (if string)
2. `msg.content` array → join text parts
3. `msg.parts` array
4. `msg.content.text`
5. JSON stringify as fallback

**Response extraction**:
1. `output.content`
2. `output.message.content`
3. `output.choices[0].message.content` (OpenAI)
4. `output.candidates[0].content` (Google)
5. `attribute.response`

---

## Rendering Strategy

### Hierarchical Rendering

```
Root Span (level 0)
├─ Message 1
├─ Message 2
└─ Child Span (level 1) - indented 16px
    ├─ Message 3
    └─ Grandchild Span (level 2) - indented 32px
        └─ Message 4
```

**Indentation**:
```typescript
const indentStyle = level > 3 ? { marginLeft: `${level * 16}px` } : {};
```

- Level 0: No indentation
- Level 1: 16px
- Level 2: 32px
- Level 3+: Continues incrementing

### Deduplication

**Problem**: Same run may appear multiple times in hierarchy

**Solution**: Keep span with **most messages**

```typescript
// If duplicate run_id found
if (currentMessageCount > existingMessageCount) {
  // Replace with span that has more messages
  runIdMap.set(runId, { span: spanWithMessages, index: existing.index });
}
```

**Example**:
```
Input:
- Span A (run_id: "abc", messages: 2)
- Span B (run_id: "abc", messages: 5) ← Kept (more complete)

Output:
- Span B (5 messages)
```

---

## User Interactions

### 1. Click Run ID Badge
```typescript
<RunIdSeparator
  runId={span.run_id}
  onClick={(runId) => {
    // Navigate to run details
    // Or open run panel
    // Or filter by run
  }}
/>
```

### 2. Expand/Collapse Child Conversations
```typescript
<button onClick={() => setIsExpanded(!isExpanded)}>
  {isExpanded ? 'Collapse' : 'Expand'} Child Conversation
  ({nestedMessageCount} messages)
</button>
```

**State**: Local `useState` per span

### 3. Click AI Message to View Trace
```typescript
const handleOpenTrace = () => {
  setOpenTraces([{ run_id: runId, tab: 'trace' }]);
  fetchSpansByRunId(runId);
  setIsRightSidebarCollapsed(false);
};
```

**Behavior**:
- Opens right sidebar
- Loads full span tree for run
- Shows trace timeline

### 4. Hover Message to Highlight Run
```typescript
onMouseEnter={() => setHoveredRunId(runId)}
onMouseLeave={() => setHoveredRunId(null)}
```

**Effect**: Highlights all UI elements related to that run

### 5. Refresh Button
```typescript
<ConversationHeader onRefresh={refreshSpans} />
```

**Behavior**:
- Re-fetches spans from API
- Rebuilds hierarchy
- Updates messages

---

## Real-time Updates

### Event Stream Integration

```typescript
useConversationEvents({
  currentProjectId: projectId,
  currentThreadId: threadId,
});
```

**When new span arrives**:
```typescript
addEventSpan(eventSpan) {
  // 1. Convert to normal span
  const span = convertToNormalSpan(eventSpan);

  // 2. Update runs list
  setRawRuns(prev => /* upsert logic */);

  // 3. Update span map
  setSpanMap(prev => ({ ...prev, [runId]: [...spans, span] }));

  // 4. If belongs to current thread
  if (span.thread_id === currentThread) {
    // Add to conversation spans
    setConversationSpans(prev => [...prev, span]);

    // Rebuild hierarchy
    const hierarchy = buildSpanHierarchy(updatedSpans);
    setHierarchicalSpans(hierarchy);
  }
}
```

**Result**: Messages automatically appear in real-time

---

## Styling & Themes

### Color Scheme

**Run ID Separator**:
- Background: `bg-muted/50` → `bg-muted` on hover
- Border: `border-border/40` → `border-border` on hover
- Text: `text-muted-foreground/90` → `text-foreground` on hover

**Child Conversation Badge**:
- Background: `bg-primary/5` → `bg-primary/10` on hover
- Border: `border-primary/20` → `border-primary/30` on hover
- Text: `text-primary/90` → `text-primary` on hover

**Messages**:
- AI messages: Neutral tones with provider-specific icons
- Human messages: Accent color (blue/primary)
- Tool calls: Muted background with border

### Responsive Design

**Indentation** (desktop):
- 16px per level

**Mobile considerations**:
- Could reduce to 8px per level
- Could limit max indentation depth
- Could use different visual indicator (border-left)

---

## Performance Considerations

### Optimization Strategies

1. **useMemo for expensive computations**:
```typescript
const displayMessages = useMemo(() =>
  convertSpansToMessages(hierarchicalSpans),
  [hierarchicalSpans]
);
```

2. **Collapsed children don't render**:
```typescript
{hasChildren && isExpanded && (
  <div>/* Children only mount when expanded */</div>
)}
```

3. **Deduplication reduces DOM nodes**:
- Removes duplicate runs before rendering

4. **Virtual scrolling** (future):
- For very long conversations (1000+ messages)
- Could use `react-window` or `react-virtualized`

### Memory Management

**Large conversations**:
- Current: Renders all messages in DOM
- Future: Consider pagination or virtual scrolling

**Event stream**:
- Only spans for current thread are processed
- Old spans are not automatically removed (could add TTL)

---

## Testing Considerations

### Unit Tests

**Components to test**:
1. `extractMessagesFromSpan()` - Message extraction logic
2. `buildSpanHierarchy()` - Tree construction
3. `countNestedMessages()` - Recursive counting
4. `extractValidDisplayMessages()` - Deduplication

**Test cases**:
- Empty spans
- Spans without messages
- Duplicate run_ids
- Deep nesting (5+ levels)
- Missing attributes
- Malformed JSON

### Integration Tests

**Scenarios**:
1. Load conversation → shows messages
2. Receive span event → updates in real-time
3. Click run ID → opens details
4. Expand/collapse → shows/hides children
5. Hover message → highlights run

---

## Future Enhancements

### Potential Features

1. **Search within conversation**
   - Full-text search across all messages
   - Highlight matches
   - Jump to result

2. **Filter by run/model**
   - Show only messages from specific run
   - Show only specific model's responses

3. **Export conversation**
   - Export to JSON/Markdown
   - Include/exclude metrics

4. **Message actions**
   - Copy message
   - Regenerate response
   - Edit and resubmit

5. **Annotations**
   - Add notes to messages
   - Tag interesting exchanges
   - Create snippets

6. **Performance mode**
   - Virtual scrolling
   - Lazy load old messages
   - Collapse by default

7. **Diff view**
   - Compare runs side-by-side
   - Show what changed between retries

---

## Troubleshooting

### Common Issues

**Problem**: Messages not appearing
- **Check**: Are spans being fetched? (`isLoadingSpans`)
- **Check**: Do spans have `operation_name` that passes `isActualModelCall()`?
- **Check**: Is `attribute.request` valid JSON?

**Problem**: Duplicate messages showing
- **Check**: Deduplication logic in `extractValidDisplayMessages()`
- **Check**: Multiple spans with same `run_id`?

**Problem**: Hierarchy not showing correctly
- **Check**: `parent_span_id` relationships in data
- **Check**: `buildSpanHierarchy()` logic

**Problem**: Real-time updates not working
- **Check**: Event stream connected?
- **Check**: `thread_id` matches?
- **Check**: `addEventSpan()` being called?

---

## API Dependencies

### Required Endpoints

1. **GET /spans**
   - Filter by `thread_id`
   - Returns flat list of spans
   - Includes `parent_span_id` for hierarchy

2. **GET /runs**
   - List runs for thread
   - Used for run metadata

3. **WebSocket/SSE** (events)
   - Real-time span events
   - Format: `LangDBEventSpan`

### Data Models

**Span**:
```typescript
interface Span {
  span_id: string;
  trace_id: string;
  thread_id: string;
  parent_span_id?: string;
  run_id: string;
  operation_name: string;
  start_time_us: number;
  finish_time_us: number;
  attribute: {
    request?: string;  // JSON
    output?: string;   // JSON
    response?: string; // JSON
    usage?: string;    // JSON
    cost?: string;     // JSON
  };
  spans?: Span[];  // Nested children (after hierarchy built)
}
```

**Message** (derived):
```typescript
interface Message {
  id: string;
  type: 'human' | 'assistant' | 'system' | 'tool';
  role?: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  thread_id: string;
  trace_id?: string;
  span_id?: string;
  tool_calls?: ToolCall[];
  metrics?: MessageMetrics[];
}
```

---

## Summary

The Chat Page uses a **spans-based architecture** where:
- Messages are **derived** from observability spans
- Hierarchy is **built** from `parent_span_id` relationships
- Rendering is **recursive** with collapsible sections
- Updates are **real-time** via event stream
- State is **centralized** in ChatWindowContext

This approach provides a **powerful debugging interface** that shows not just what was said, but the complete execution trace behind each message.
