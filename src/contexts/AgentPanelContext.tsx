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
const DEFAULT_MODE: AgentPanelMode = 'side-panel';

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

export type { AgentPanelMode, Position };
