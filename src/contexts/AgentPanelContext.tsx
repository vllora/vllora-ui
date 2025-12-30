/**
 * AgentPanelContext
 *
 * Provides shared state for the agent panel across the application.
 * Supports dynamic switching between floating and side-panel modes.
 */

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

type AgentPanelMode = 'floating' | 'side-panel';

interface Position {
  x: number;
  y: number;
}

interface AgentPanelContextType {
  /** Whether the panel is open */
  isOpen: boolean;
  /** Open the panel */
  open: () => void;
  /** Close the panel */
  close: () => void;
  /** Toggle the panel */
  toggle: () => void;
  /** Current panel mode */
  mode: AgentPanelMode;
  /** Set panel mode */
  setMode: (mode: AgentPanelMode) => void;
  /** Toggle between floating and side-panel mode */
  toggleMode: () => void;
  /** Whether the panel is pinned (side-panel mode) */
  isPinned: boolean;
  /** Position for floating panel (from toggle button) */
  floatingPosition: Position | null;
  /** Set the floating position (called by toggle button) */
  setFloatingPosition: (pos: Position) => void;
}

const AgentPanelContext = createContext<AgentPanelContextType | undefined>(undefined);

const MODE_STORAGE_KEY = 'vllora:agent-panel-mode';
const PANEL_STORAGE_KEY = 'vllora:agent-panel-bounds';
const DEFAULT_MODE: AgentPanelMode = 'side-panel';

// Side panel dimensions (must match AgentPanel.tsx)
const SIDE_PANEL_WIDTH = 384;
const EDGE_PADDING = 16;

// Set floating panel bounds to match side panel position (full height)
const setFloatingBoundsFromSidePanel = () => {
  try {
    // Match side panel's full height (h-full) minus small padding
    const height = typeof window !== 'undefined'
      ? window.innerHeight
      : 600;

    const bounds = {
      x: EDGE_PADDING,
      y: EDGE_PADDING,
      width: SIDE_PANEL_WIDTH,
      height,
    };
    localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(bounds));
  } catch {
    // Ignore storage errors
  }
};


// Load mode from localStorage or use default
const loadMode = (): AgentPanelMode => {
  try {
    const stored = localStorage.getItem(MODE_STORAGE_KEY);
    if (stored === 'floating' || stored === 'side-panel') {
      return stored;
    }
  } catch {
    // Ignore storage errors
  }
  return DEFAULT_MODE;
};

// Save mode to localStorage
const saveMode = (mode: AgentPanelMode) => {
  try {
    localStorage.setItem(MODE_STORAGE_KEY, mode);
  } catch {
    // Ignore storage errors
  }
};

interface AgentPanelProviderProps {
  children: ReactNode;
}

export function AgentPanelProvider({ children }: AgentPanelProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setModeState] = useState<AgentPanelMode>(loadMode);
  const [floatingPosition, setFloatingPosition] = useState<Position | null>(null);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  const setMode = useCallback((newMode: AgentPanelMode) => {
    setModeState(newMode);
    saveMode(newMode);
  }, []);

  const toggleMode = useCallback(() => {
    setModeState((prev) => {
      const newMode = prev === 'floating' ? 'side-panel' : 'floating';
      saveMode(newMode);

      if (newMode === 'floating') {
        // Switching from side-panel to floating:
        // Position floating panel to match where side panel was
        setFloatingBoundsFromSidePanel();
      }

      setFloatingPosition(null);
      return newMode;
    });
  }, []);

  // isPinned is true when in side-panel mode
  const isPinned = mode === 'side-panel';

  return (
    <AgentPanelContext.Provider
      value={{
        isOpen,
        open,
        close,
        toggle,
        mode,
        setMode,
        toggleMode,
        isPinned,
        floatingPosition,
        setFloatingPosition,
      }}
    >
      {children}
    </AgentPanelContext.Provider>
  );
}

export function useAgentPanel(): AgentPanelContextType {
  const context = useContext(AgentPanelContext);
  if (context === undefined) {
    throw new Error('useAgentPanel must be used within an AgentPanelProvider');
  }
  return context;
}

// Export storage key for use by FloatingAgentPanel
export { PANEL_STORAGE_KEY };

export type { AgentPanelMode, Position };
