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
├── AgentPanel.tsx           # Main chat panel using @distri/react Chat
├── AgentToggleButton.tsx    # Floating draggable toggle button
├── AgentPanelWrapper.tsx    # Manages panel state + draggable button
├── index.ts                 # Exports
└── hooks/
    └── useDraggable.ts      # Reusable drag hook with edge snapping
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

export interface Position { x: number; y: number }

export interface UseDraggableOptions {
  storageKey?: string;           // localStorage key for persistence
  defaultPosition: Position;     // Initial position
  snapToEdge?: boolean;          // Snap to left/right edge on release
  edgePadding?: number;          // Padding from viewport edges (default: 16)
  dragThreshold?: number;        // Min pixels before drag starts (default: 5)
  elementSize?: { width: number; height: number }; // Size for boundary calc
}

export interface UseDraggableReturn {
  position: Position;            // Current position
  isDragging: boolean;           // True while actively dragging
  isOnLeftSide: boolean;         // True if button is on left half of screen
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
  // 7. Returns isOnLeftSide for panel positioning
}
```

---

## 7. AgentPanelWrapper Implementation

```typescript
// src/components/agent/AgentPanelWrapper.tsx

import { useState, useCallback } from 'react';
import { AgentPanel } from './AgentPanel';
import { AgentToggleButton } from './AgentToggleButton';
import { useDraggable } from './hooks/useDraggable';
import { useDistriConnection } from '@/providers/DistriProvider';

const getDefaultPosition = () => ({
  x: typeof window !== 'undefined' ? window.innerWidth - 64 : 0,
  y: typeof window !== 'undefined' ? window.innerHeight - 80 : 0,
});

export function AgentPanelWrapper() {
  const [isOpen, setIsOpen] = useState(false);
  const { isInitializing } = useDistriConnection();

  // Draggable button with edge snapping and persistence
  const { position, isDragging, isOnLeftSide, handlers } = useDraggable({
    storageKey: 'vllora:agent-button-position',
    defaultPosition: getDefaultPosition(),
    snapToEdge: true,
    edgePadding: 16,
    dragThreshold: 5,
    elementSize: { width: 48, height: 48 },
  });

  const handleToggle = useCallback(() => {
    if (!isDragging) {
      setIsOpen(prev => !prev);
    }
  }, [isDragging]);

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  // Don't render anything if still initializing
  if (isInitializing) {
    return null;
  }

  return (
    <>
      <AgentToggleButton
        isOpen={isOpen}
        onClick={handleToggle}
        hasUnread={false}
        position={position}
        isDragging={isDragging}
        onMouseDown={handlers.onMouseDown}
        onTouchStart={handlers.onTouchStart}
      />
      <AgentPanel
        isOpen={isOpen}
        onClose={handleClose}
        side={isOnLeftSide ? 'right' : 'left'}
      />
    </>
  );
}
```

---

## 8. Integration in App.tsx

The `AgentPanelWrapper` is added at the App level, inside the `DistriProvider`:

```typescript
// src/App.tsx
import { DistriProvider } from '@/providers/DistriProvider';
import { AgentPanelWrapper } from '@/components/agent';

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={
              <ProtectedRoute>
                <DistriProvider>
                  <ProjectsProvider>
                    {/* ... other providers ... */}
                    <Layout />
                    <AgentPanelWrapper />
                  </ProjectsProvider>
                </DistriProvider>
              </ProtectedRoute>
            }>
              {/* ... routes ... */}
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
```

**Key points:**
- `AgentPanelWrapper` is placed **inside** `DistriProvider` to access connection state
- It's a sibling of `Layout`, rendering as a fixed overlay
- Available on all protected pages

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
1. **Local state** for UI (open/closed)
2. **Position state** with localStorage persistence (draggable button via `useDraggable`)
3. **`useDistriConnection` hook** for connection state (loading, error)
4. **`@distri/react` Chat component** for agent communication (handles messages, tools)
5. **Event emitter** for UI tool execution

---

## Related Documents

- [Frontend Integration](./frontend-integration.md) - Hook and provider setup
- [Tools](./tools.md) - Tool handlers that power the panel
- [Setup Guide](./setup-guide.md) - How to get everything running
