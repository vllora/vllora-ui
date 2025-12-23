# UI Design: Floating Agent Panel

The Distri agent appears as a **floating chat panel** in the bottom-right corner of the vLLora UI. This design allows users to interact with the agent while viewing traces, without leaving their current context.

## Current vLLora Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ ┌──────┐ ┌─────────────────────────────────────────────────────┐│
│ │      │ │                    Header                           ││
│ │ Side │ ├─────────────────────────────────────────────────────┤│
│ │ bar  │ │                                                     ││
│ │      │ │                  Main Content                       ││
│ │ Home │ │              (Chat, Traces, etc.)                   ││
│ │ Chat │ │                                                     ││
│ │      │ │                                                     ││
│ │──────│ │                                                     ││
│ │ Sett │ │                                                     ││
│ └──────┘ └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

## With Agent Panel (Expanded)

```
┌─────────────────────────────────────────────────────────────────┐
│ ┌──────┐ ┌─────────────────────────────────────────────────────┐│
│ │      │ │                    Header                           ││
│ │ Side │ ├─────────────────────────────────────────────────────┤│
│ │ bar  │ │                                     ┌──────────────┐││
│ │      │ │                                     │ Agent Panel  │││
│ │ Home │ │        Main Content                 │──────────────│││
│ │ Chat │ │       (Traces View)                 │ Messages...  │││
│ │      │ │                                     │              │││
│ │──────│ │                                     │ ┌──────────┐ │││
│ │ Sett │ │                                     │ │  Input   │ │││
│ └──────┘ └─────────────────────────────────────┴──────────────┴┘│
│                                                        [Bot]    │
└─────────────────────────────────────────────────────────────────┘
                                                          ↑
                                                   Toggle Button
```

---

## Component Structure

```
src/components/agent/
├── AgentPanel.tsx        # Main panel component
├── AgentToggleButton.tsx # Floating draggable toggle button
├── AgentWidget.tsx       # Wrapper combining panel + button + state
├── AgentMessage.tsx      # Individual message component
├── index.ts              # Exports
└── hooks/
    └── useDraggable.ts   # Reusable drag hook with edge snapping
```

---

## 1. Toggle Button (Draggable)

The toggle button is **draggable** like iPhone's AssistiveTouch.

### Behavior

| Feature | Description |
|---------|-------------|
| **Default Position** | Bottom-right corner (`bottom-4 right-4`) |
| **Appearance** | Circular button (48x48px) with Bot icon |
| **Click** | Open/close the panel |
| **Drag** | Move to any position on screen |
| **Release** | Snaps to nearest edge (left or right) |

### States

| State | Appearance |
|-------|------------|
| Closed | Primary color with Bot icon |
| Open | Muted color with X icon |
| Activity | Pulsing animation when agent is working |
| Dragging | Slight scale up, shadow increase |

### Draggable Features

| Feature | Behavior |
|---------|----------|
| Edge Snapping | Snaps to left or right edge on release |
| Boundary Constraints | Stays within viewport (with 16px padding) |
| Position Persistence | Saves position to localStorage |
| Touch Support | Works with mouse and touch events |
| Drag Threshold | 5px movement before drag starts |
| Smooth Animation | 200ms spring animation on snap |

### Panel Position Adjustment

When the button is on the left side, the panel opens to the right:

```
Button on RIGHT:          Button on LEFT:
┌──────────────┐          ┌──────────────┐
│ Agent Panel  │          │ Agent Panel  │
│              │          │              │
└──────────────┘          └──────────────┘
           [Bot]          [Bot]
```

---

## 2. Agent Panel Structure

```
┌─────────────────────────────────────┐
│  Bot vLLora Assistant          [X] │  ← Header
│  Your AI debugging companion        │
├─────────────────────────────────────┤
│                                     │
│  ┌─────────────────────────────┐   │
│  │ Find performance bottlenecks │   │  ← Quick Suggestions
│  └─────────────────────────────┘   │    (shown when empty)
│  ┌─────────────────────────────┐   │
│  │ Find errors from today      │   │
│  └─────────────────────────────┘   │
│  ┌─────────────────────────────┐   │
│  │ Analyze costs by model      │   │
│  └─────────────────────────────┘   │
│                                     │
├─────────────────────────────────────┤  ← Messages Area
│                                     │    (scrollable)
│  ┌─────────────────────────────┐   │
│  │ You: Find slow spans today  │   │  ← User Message
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ Wrench fetch_runs({limit: 10}) │   │  ← Tool Call
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ Bot Calling data_agent...   │   │  ← Agent Call
│  └─────────────────────────────┘   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ I found 3 slow spans:       │   │  ← Response
│  │ • span_abc (2.3s) - OpenAI  │   │
│  │ • span_def (1.8s) - Tool    │   │
│  │ [Highlighted in trace view] │   │
│  └─────────────────────────────┘   │
│                                     │
├─────────────────────────────────────┤
│  ┌─────────────────────────┐  [>] │  ← Input Area
│  │ Ask about your traces...│       │
│  └─────────────────────────┘       │
└─────────────────────────────────────┘
```

### Panel Dimensions

| Property | Value |
|----------|-------|
| Width | 384px (w-96) |
| Height | 500px (max 70vh) |
| Position | Fixed, relative to toggle button |
| Border Radius | rounded-lg |
| Shadow | shadow-2xl |

### Section Details

| Section | Description |
|---------|-------------|
| **Header** | Bot icon, title "vLLora Assistant", subtitle, close button (X) |
| **Quick Suggestions** | Clickable chips shown when no messages. Disappear after first message |
| **Messages Area** | Scrollable container for conversation history |
| **Input Area** | Text input + send button. Disabled while processing |

---

## 3. Message Types

| Type | Style | Icon | Example |
|------|-------|------|---------|
| **User** | Right-aligned, primary bg | None | "Find errors from yesterday" |
| **Response** | Left-aligned, muted bg | Bot | "I found 3 errors in thread-xyz..." |
| **Tool Call** | Left-aligned, amber/yellow bg, monospace | Wrench | `highlight_span({ spanId: "abc" })` |
| **Agent Call** | Left-aligned, blue bg | Bot | "Calling data_agent to fetch traces..." |
| **Thinking** | Left-aligned, muted, animated | Loader | "Analyzing trace data..." |
| **Error** | Left-aligned, red bg | X | "Failed to connect to Distri server" |

---

## 4. Interactive Elements

1. **Quick Suggestion Chips** - Click to auto-send that query
2. **Span IDs in responses** - Clickable, triggers `select_span` + scroll
3. **Run IDs in responses** - Clickable, navigates to that run
4. **Copy button** - On responses, copies text to clipboard
5. **Retry button** - On errors, retries the last message

---

## 5. Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd/Ctrl + J` | Toggle agent panel |
| `Escape` | Close agent panel |
| `Enter` | Send message |
| `Shift + Enter` | New line in input |

---

## 6. useDraggable Hook

```typescript
// src/components/agent/hooks/useDraggable.ts

interface Position { x: number; y: number }

interface UseDraggableOptions {
  storageKey?: string;           // localStorage key for persistence
  defaultPosition: Position;     // Initial position
  snapToEdge?: boolean;          // Snap to left/right edge on release
  edgePadding?: number;          // Padding from viewport edges (default: 16)
  dragThreshold?: number;        // Min pixels before drag starts (default: 5)
}

interface UseDraggableReturn {
  position: Position;            // Current position
  isDragging: boolean;           // True while actively dragging
  handlers: {
    onMouseDown: (e: React.MouseEvent) => void;
    onTouchStart: (e: React.TouchEvent) => void;
  };
}

export function useDraggable(options: UseDraggableOptions): UseDraggableReturn {
  // Implementation handles:
  // 1. Mouse and touch events
  // 2. Drag threshold to distinguish click vs drag
  // 3. Edge snapping on release
  // 4. Viewport boundary constraints
  // 5. localStorage persistence
  // 6. Window resize handling
}
```

---

## 7. AgentWidget Implementation

```typescript
// src/components/agent/AgentWidget.tsx

function AgentWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const {
    sendToAgent,
    isProcessing,
    activities,
    messages
  } = useVlloraAgent();

  // Draggable button with edge snapping
  const {
    position,
    isDragging,
    handlers
  } = useDraggable({
    storageKey: 'agent-button-position',
    defaultPosition: { x: window.innerWidth - 64, y: window.innerHeight - 80 },
    snapToEdge: true,
    edgePadding: 16
  });

  // Panel opens on opposite side of button
  const panelSide = position.x < window.innerWidth / 2 ? 'right' : 'left';

  return (
    <>
      <AgentPanel
        isOpen={isOpen}
        side={panelSide}
        buttonPosition={position}
        onClose={() => setIsOpen(false)}
        onSend={sendToAgent}
        isProcessing={isProcessing}
        activities={activities}
        messages={messages}
      />
      <AgentToggleButton
        position={position}
        isOpen={isOpen}
        isDragging={isDragging}
        onClick={() => !isDragging && setIsOpen(!isOpen)}
        hasActivity={isProcessing}
        {...handlers}
      />
    </>
  );
}
```

---

## 8. Integration in Layout

Update `src/components/layout.tsx`:

```typescript
import { AgentWidget } from '@/components/agent';

export function Layout() {
  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar ... />
      <div className="flex-1 flex flex-col overflow-hidden">
        <AppHeader ... />
        <main className="flex-1 flex overflow-hidden">
          ...
          <Outlet />
        </main>
      </div>

      {/* Agent floating panel - available on all pages */}
      <AgentWidget />
    </div>
  )
}
```

---

## 9. Visual Design

| Property | Value |
|----------|-------|
| **Colors** | Uses existing theme variables (`--primary`, `--muted`, etc.) |
| **Border Radius** | `rounded-lg` for panel, `rounded-full` for toggle |
| **Shadow** | `shadow-2xl` for elevated appearance |
| **Animation** | `slide-in-from-bottom-5 fade-in` on open |
| **Drag Animation** | Spring animation (200ms) when snapping to edge |

---

## State Management

The agent panel uses:
1. **Local state** for UI (open/closed, input text)
2. **Position state** with localStorage persistence (draggable button)
3. **`useVlloraAgent` hook** for agent communication
4. **`useDraggable` hook** for drag behavior
5. **Event emitter** for UI tool execution

---

## Related Documents

- [Frontend Integration](./frontend-integration.md) - Hook and provider setup
- [Tools](./tools.md) - Tool handlers that power the panel
- [Setup Guide](./setup-guide.md) - How to get everything running
