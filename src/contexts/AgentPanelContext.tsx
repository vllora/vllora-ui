/**
 * AgentPanelContext
 *
 * Provides shared state for the agent panel across the application.
 * Used by both the floating toggle button and the sidebar trigger.
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
  /** Position for floating panel (from toggle button) */
  floatingPosition: Position | null;
  /** Set the floating position (called by toggle button) */
  setFloatingPosition: (pos: Position) => void;
}

const AgentPanelContext = createContext<AgentPanelContextType | undefined>(undefined);

const PANEL_MODE: AgentPanelMode =
  (typeof import.meta !== 'undefined' &&
    (import.meta.env?.VITE_AGENT_PANEL_MODE as AgentPanelMode)) ||
  'floating';

interface AgentPanelProviderProps {
  children: ReactNode;
}

export function AgentPanelProvider({ children }: AgentPanelProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [floatingPosition, setFloatingPosition] = useState<Position | null>(null);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

  return (
    <AgentPanelContext.Provider
      value={{
        isOpen,
        open,
        close,
        toggle,
        mode: PANEL_MODE,
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

export { PANEL_MODE };
export type { AgentPanelMode, Position };
