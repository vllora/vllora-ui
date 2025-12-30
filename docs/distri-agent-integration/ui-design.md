# UI Design: Agent Panel

The Distri agent can appear in two modes, controlled by the `VITE_AGENT_PANEL_MODE` environment variable:

1. **Floating Mode** (default): A draggable, resizable floating panel with a toggle button
2. **Side Panel Mode**: A sliding panel triggered from the sidebar

## Panel Modes

### Floating Mode (`VITE_AGENT_PANEL_MODE='floating'`)

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
│                                                        [●]      │
└─────────────────────────────────────────────────────────────────┘
                                                          ↑
                                               Draggable Toggle Button
```

Features:
- Toggle button can be dragged anywhere on screen
- Panel opens near the button position
- Panel is resizable (drag edges/corners)
- Panel is draggable (drag header)
- Both positions persist in localStorage

### Side Panel Mode (`VITE_AGENT_PANEL_MODE='side-panel'`)

```
┌─────────────────────────────────────────────────────────────────┐
│ ┌──────┐┌────────────┐┌──────────────────────────────────────────┐│
│ │      ││            ││                    Header                ││
│ │ Side ││   Agent    │├──────────────────────────────────────────┤│
│ │ bar  ││   Panel    ││                                          ││
│ │      ││            ││                                          ││
│ │ Home ││ Messages...││              Main Content                ││
│ │ Chat ││            ││             (Traces View)                ││
│ │ [AI] ││            ││                                          ││
│ │──────││ ┌────────┐ ││                                          ││
│ │ Sett ││ │ Input  │ ││                                          ││
│ └──────┘└────────────┘└──────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
     ↑
  AI button in sidebar triggers panel
```

Features:
- AI Assistant button in sidebar (collapsed or expanded)
- Panel slides in from the left
- Fixed width, full height

---

## Component Structure

```
src/components/agent/
├── FloatingAgentPanel.tsx   # Floating panel with integrated toggle button
├── AgentPanel.tsx           # Side panel component
├── AgentToggleButton.tsx    # Standalone toggle button (optional use)
├── SidebarAgentButton.tsx   # AI button for sidebar (side-panel mode only)
├── AgentPanelWrapper.tsx    # Mode switching wrapper
├── index.ts                 # Exports
└── hooks/
    ├── useDraggable.ts          # Drag hook for toggle button
    └── useResizableDraggable.ts # Drag + resize hook for panel
```

---

## Environment Variable

Set the panel mode in your `.env` file:

```bash
# Floating mode (default) - draggable button + resizable panel
VITE_AGENT_PANEL_MODE=floating

# Side panel mode - sidebar button + sliding panel
VITE_AGENT_PANEL_MODE=side-panel
```

---

## 1. Floating Mode Components

### FloatingAgentPanel

The main component that handles both the toggle button and panel in floating mode.

| Feature | Description |
|---------|-------------|
| **Toggle Button** | Draggable button, can go anywhere on screen |
| **Panel** | Resizable, draggable floating panel |
| **Independent Positions** | Button and panel have separate position storage |
| **Panel Opens Near Button** | When opened, panel positions relative to button |

### Toggle Button (integrated in FloatingAgentPanel)

| Feature | Description |
|---------|-------------|
| **Default Position** | Bottom-right corner |
| **Drag** | Freely draggable anywhere on screen |
| **Click** | Opens the panel |
| **Persistence** | Position saved to `vllora:agent-button-position` |
| **Size** | 48x48px circular button |

### Panel (when open)

| Feature | Description |
|---------|-------------|
| **Default Size** | 400x600px |
| **Min Size** | 320x400px |
| **Max Size** | 700x850px |
| **Resize** | Drag any edge or corner |
| **Drag** | Drag the header to move |
| **Persistence** | Bounds saved to `vllora:agent-panel-bounds` |
| **Minimize** | Click minimize button to collapse to header only |

---

## 2. Side Panel Mode Components

### SidebarAgentButton

Button in the sidebar that triggers the panel. Only renders in side-panel mode.

| Feature | Description |
|---------|-------------|
| **Collapsed State** | Icon-only button with tooltip |
| **Expanded State** | Full button with "AI Assistant" label |
| **Active State** | Highlighted when panel is open |

### AgentPanel (Side Panel)

| Feature | Description |
|---------|-------------|
| **Position** | Fixed, slides from left |
| **Width** | 400px (sm), 450px (lg) |
| **Height** | Full viewport height |
| **Animation** | Slide transition (300ms) |

---

## 3. Hooks

### useDraggable

Hook for the toggle button with free-form dragging.

```typescript
export interface UseDraggableOptions {
  storageKey?: string;           // localStorage key for persistence
  defaultPosition: Position;     // Initial position
  snapToEdge?: boolean;          // Snap to left/right edge on release
  edgePadding?: number;          // Padding from viewport edges (default: 16)
  dragThreshold?: number;        // Min pixels before drag starts (default: 5)
  elementSize?: { width: number; height: number };
}

export interface UseDraggableReturn {
  position: Position;            // Current position
  isDragging: boolean;           // True while dragging
  wasDragged: boolean;           // True if drag just completed (prevents click)
  isOnLeftSide: boolean;         // True if on left half of screen
  handlers: {
    onMouseDown: (e: React.MouseEvent) => void;
    onTouchStart: (e: React.TouchEvent) => void;
  };
}
```

### useResizableDraggable

Hook for the panel with drag + resize capabilities.

```typescript
export interface UseResizableDraggableOptions {
  storageKey?: string;           // localStorage key for persistence
  defaultBounds: PanelBounds;    // Initial position + size
  minSize?: Size;                // Minimum dimensions
  maxSize?: Size;                // Maximum dimensions
  edgePadding?: number;          // Padding from viewport edges
}

export interface UseResizableDraggableReturn {
  bounds: PanelBounds;           // Current position + size
  isDragging: boolean;           // True while dragging header
  isResizing: boolean;           // True while resizing
  resizeDirection: ResizeDirection | null;
  dragHandlers: { onMouseDown; onTouchStart };
  getResizeHandlers: (direction: ResizeDirection) => { onMouseDown; onTouchStart };
  resetBounds: () => void;       // Reset to default bounds
}
```

---

## 4. State Management

### AgentPanelContext

Shared context for panel open/close state across components.

```typescript
interface AgentPanelContextType {
  isOpen: boolean;
  toggle: () => void;
  open: () => void;
  close: () => void;
}

// Usage
const { isOpen, toggle, close } = useAgentPanel();
```

### localStorage Keys

| Key | Description |
|-----|-------------|
| `vllora:agent-button-position` | Toggle button position `{ x, y }` |
| `vllora:agent-panel-bounds` | Panel bounds `{ position: { x, y }, size: { width, height } }` |
| `vllora:agentThreadId` | Current chat thread ID |

---

## 5. AgentPanelWrapper

The wrapper component that switches between modes:

```typescript
export function AgentPanelWrapper() {
  const { isInitializing } = useDistriConnection();
  const { isOpen, toggle, close } = useAgentPanel();

  if (isInitializing) return null;

  // Floating mode
  if (PANEL_MODE === 'floating') {
    return (
      <FloatingAgentPanel
        isOpen={isOpen}
        onToggle={toggle}
        onClose={close}
      />
    );
  }

  // Side panel mode
  return (
    <AgentPanel
      isOpen={isOpen}
      onClose={close}
      side="left"
    />
  );
}
```

---

## 6. Integration in App.tsx

```typescript
import { DistriProvider } from '@/providers/DistriProvider';
import { AgentPanelWrapper } from '@/components/agent';
import { AgentPanelProvider } from '@/contexts/AgentPanelContext';

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={
              <ProtectedRoute>
                <DistriProvider>
                  <AgentPanelProvider>
                    <ProjectsProvider>
                      {/* ... other providers ... */}
                      <Layout />
                      <AgentPanelWrapper />
                    </ProjectsProvider>
                  </AgentPanelProvider>
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
- `AgentPanelProvider` provides shared open/close state
- `AgentPanelWrapper` is placed inside `DistriProvider`
- In side-panel mode, `SidebarAgentButton` in sidebar uses the same context

---

## 7. Visual Design

| Property | Floating Mode | Side Panel Mode |
|----------|---------------|-----------------|
| **Panel Border** | `rounded-lg` | Square (full height) |
| **Shadow** | `shadow-2xl` | `shadow-xl` |
| **Z-Index** | 50 | 50 |
| **Backdrop** | None | Semi-transparent (mobile only) |

### Panel Header

```
┌─────────────────────────────────────┐
│  💬 vLLora Assistant    [+] [-] [X] │
└─────────────────────────────────────┘
     ↑                     ↑   ↑   ↑
   Title              New Chat │ Close
                          Minimize
```

---

## 8. Resize Handles (Floating Mode)

The panel has 8 resize handles:

```
      [N]
   ┌───────┐
[NW]       [NE]
   │       │
[W]│       │[E]
   │       │
[SW]       [SE]
   └───────┘
      [S]
```

Each handle allows resizing in its direction, with min/max size constraints.

---

## Related Documents

- [Frontend Integration](./frontend-integration.md) - Hook and provider setup
- [Tools](./tools.md) - Tool handlers that power the panel
- [Setup Guide](./setup-guide.md) - How to get everything running
