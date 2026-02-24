/**
 * WorkspaceTabsContext
 *
 * Manages open/active/pinned tabs for the VS Code-style workspace.
 * Each tab represents a virtual file path from the Explorer.
 *
 * Behavior (matching VS Code):
 * - Single-click in Explorer = preview tab (italic, replaced by next preview)
 * - Double-click in Explorer = pinned tab (persists)
 * - Close (×) removes tab, activates nearest
 * - Open tabs persist in localStorage
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";

// ============================================================================
// Types
// ============================================================================

export interface WorkspaceTab {
  /** Virtual file path (unique ID) */
  path: string;
  /** Display label for the tab */
  label: string;
  /** Whether this tab is pinned (false = preview, can be replaced) */
  isPinned: boolean;
}

interface WorkspaceTabsContextType {
  /** Ordered list of open tabs */
  tabs: WorkspaceTab[];
  /** Path of the currently active tab */
  activeTabPath: string | null;
  /** Open or focus a tab. If preview=true and not already pinned, it replaces the current preview tab. */
  openTab: (path: string, label?: string, preview?: boolean) => void;
  /** Pin an existing tab (promote from preview to permanent) */
  pinTab: (path: string) => void;
  /** Close a tab */
  closeTab: (path: string) => void;
  /** Set the active tab */
  setActiveTab: (path: string) => void;
  /** Close all tabs */
  closeAllTabs: () => void;
}

// ============================================================================
// Context
// ============================================================================

const WorkspaceTabsContext = createContext<WorkspaceTabsContextType | undefined>(undefined);

// ============================================================================
// Helpers
// ============================================================================

const STORAGE_KEY_PREFIX = "workspace-tabs-";

function loadTabs(datasetId: string): WorkspaceTab[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY_PREFIX}${datasetId}`);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore corrupt data */ }
  return [];
}

function loadActiveTab(datasetId: string): string | null {
  try {
    return localStorage.getItem(`${STORAGE_KEY_PREFIX}${datasetId}-active`);
  } catch { return null; }
}

function saveTabs(datasetId: string, tabs: WorkspaceTab[]) {
  try {
    // Only persist pinned tabs (previews are ephemeral)
    const pinned = tabs.filter((t) => t.isPinned);
    localStorage.setItem(`${STORAGE_KEY_PREFIX}${datasetId}`, JSON.stringify(pinned));
  } catch { /* storage full, ignore */ }
}

function saveActiveTab(datasetId: string, path: string | null) {
  try {
    if (path) {
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${datasetId}-active`, path);
    } else {
      localStorage.removeItem(`${STORAGE_KEY_PREFIX}${datasetId}-active`);
    }
  } catch { /* ignore */ }
}

/** Derive a display label from a virtual file path */
function labelFromPath(path: string): string {
  // "evaluations/grader-script.ts" → "grader-script.ts"
  // "topics/openings/" → "openings/"
  // "readme.md" → "readme.md"
  const segments = path.split("/").filter(Boolean);
  return segments[segments.length - 1] || path;
}

// ============================================================================
// Provider
// ============================================================================

interface WorkspaceTabsProviderProps {
  datasetId: string;
  children: ReactNode;
}

export function WorkspaceTabsProvider({ datasetId, children }: WorkspaceTabsProviderProps) {
  const [tabs, setTabs] = useState<WorkspaceTab[]>(() => loadTabs(datasetId));
  const [activeTabPath, setActiveTabPath] = useState<string | null>(
    () => loadActiveTab(datasetId)
  );

  // Reset tabs when dataset changes
  useEffect(() => {
    const loaded = loadTabs(datasetId);
    setTabs(loaded);
    setActiveTabPath(loadActiveTab(datasetId));
  }, [datasetId]);

  // Persist on change
  useEffect(() => {
    saveTabs(datasetId, tabs);
  }, [datasetId, tabs]);

  useEffect(() => {
    saveActiveTab(datasetId, activeTabPath);
  }, [datasetId, activeTabPath]);

  const openTab = useCallback((path: string, label?: string, preview = true) => {
    const displayLabel = label || labelFromPath(path);

    setTabs((prev) => {
      // Already open? Just activate it
      const existing = prev.find((t) => t.path === path);
      if (existing) {
        setActiveTabPath(path);
        return prev;
      }

      if (preview) {
        // Replace existing preview tab (if any)
        const withoutPreview = prev.filter((t) => t.isPinned);
        const newTab: WorkspaceTab = { path, label: displayLabel, isPinned: false };
        setActiveTabPath(path);
        return [...withoutPreview, newTab];
      } else {
        // Add as pinned tab
        const newTab: WorkspaceTab = { path, label: displayLabel, isPinned: true };
        setActiveTabPath(path);
        return [...prev, newTab];
      }
    });
  }, []);

  const pinTab = useCallback((path: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.path === path ? { ...t, isPinned: true } : t))
    );
  }, []);

  const closeTab = useCallback((path: string) => {
    setTabs((prev) => {
      const idx = prev.findIndex((t) => t.path === path);
      if (idx === -1) return prev;

      const next = prev.filter((t) => t.path !== path);

      // If closing the active tab, activate the nearest remaining tab
      setActiveTabPath((currentActive) => {
        if (currentActive !== path) return currentActive;
        if (next.length === 0) return null;
        // Prefer the tab to the left, fallback to the right
        const nearestIdx = Math.min(idx, next.length - 1);
        return next[nearestIdx].path;
      });

      return next;
    });
  }, []);

  const setActiveTab = useCallback((path: string) => {
    setActiveTabPath(path);
  }, []);

  const closeAllTabs = useCallback(() => {
    setTabs([]);
    setActiveTabPath(null);
  }, []);

  const value: WorkspaceTabsContextType = {
    tabs,
    activeTabPath,
    openTab,
    pinTab,
    closeTab,
    setActiveTab,
    closeAllTabs,
  };

  return (
    <WorkspaceTabsContext.Provider value={value}>
      {children}
    </WorkspaceTabsContext.Provider>
  );
}

// ============================================================================
// Consumer
// ============================================================================

export function WorkspaceTabsConsumer() {
  const context = useContext(WorkspaceTabsContext);
  if (context === undefined) {
    throw new Error("WorkspaceTabsConsumer must be used within a WorkspaceTabsProvider");
  }
  return context;
}
