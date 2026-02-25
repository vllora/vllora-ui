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
  useRef,
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
  // "data/openings" → "openings"
  // "readme.md" → "readme.md"
  const segments = path.split("/").filter(Boolean);
  return segments[segments.length - 1] || path;
}

// ============================================================================
// Provider
// ============================================================================

interface WorkspaceTabsProviderProps {
  datasetId: string;
  /** Seed tabs used when localStorage has none (e.g., empty dataset → plan.md). */
  initialTabs?: { path: string; label: string }[];
  children: ReactNode;
}

export function WorkspaceTabsProvider({ datasetId, initialTabs, children }: WorkspaceTabsProviderProps) {
  const [tabs, setTabs] = useState<WorkspaceTab[]>(() => {
    const saved = loadTabs(datasetId);
    if (saved.length > 0) return saved;
    // No saved tabs — use initialTabs if provided
    if (initialTabs && initialTabs.length > 0) {
      return initialTabs.map((t) => ({ path: t.path, label: t.label, isPinned: true }));
    }
    return [];
  });
  const [activeTabPath, setActiveTabPath] = useState<string | null>(() => {
    const saved = loadActiveTab(datasetId);
    if (saved) return saved;
    // Default to last initialTab if provided
    if (initialTabs && initialTabs.length > 0) {
      return initialTabs[initialTabs.length - 1].path;
    }
    return null;
  });

  // Ref for closeTab to read current tabs without stale closures
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;

  // Reset tabs when dataset changes
  useEffect(() => {
    const loaded = loadTabs(datasetId);
    if (loaded.length > 0) {
      setTabs(loaded);
      setActiveTabPath(loadActiveTab(datasetId));
    } else if (initialTabs && initialTabs.length > 0) {
      setTabs(initialTabs.map((t) => ({ path: t.path, label: t.label, isPinned: true })));
      setActiveTabPath(initialTabs[initialTabs.length - 1].path);
    } else {
      setTabs([]);
      setActiveTabPath(null);
    }
  }, [datasetId, initialTabs]);

  // Apply initialTabs when they become available after mount
  // (handles the case where parent's reactive data settles after provider mounts)
  useEffect(() => {
    if (!initialTabs || initialTabs.length === 0) return;
    setTabs((prev) => {
      if (prev.length > 0) return prev; // Don't override existing tabs
      return initialTabs.map((t) => ({ path: t.path, label: t.label, isPinned: true }));
    });
    setActiveTabPath((prev) => {
      if (prev) return prev; // Don't override existing active tab
      return initialTabs[initialTabs.length - 1].path;
    });
  }, [initialTabs]);

  // Persist on change
  useEffect(() => {
    saveTabs(datasetId, tabs);
  }, [datasetId, tabs]);

  useEffect(() => {
    saveActiveTab(datasetId, activeTabPath);
  }, [datasetId, activeTabPath]);

  const openTab = useCallback((path: string, label?: string, preview = true) => {
    const displayLabel = label || labelFromPath(path);

    // Always activate the tab (separate from setTabs to avoid side effects in state updater)
    setActiveTabPath(path);

    setTabs((prev) => {
      // Already open? No tab list changes needed
      const existing = prev.find((t) => t.path === path);
      if (existing) return prev;

      if (preview) {
        // Replace existing preview tab (if any)
        const withoutPreview = prev.filter((t) => t.isPinned);
        const newTab: WorkspaceTab = { path, label: displayLabel, isPinned: false };
        return [...withoutPreview, newTab];
      } else {
        // Add as pinned tab
        const newTab: WorkspaceTab = { path, label: displayLabel, isPinned: true };
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
    const prev = tabsRef.current;
    const idx = prev.findIndex((t) => t.path === path);
    if (idx === -1) return;

    const next = prev.filter((t) => t.path !== path);
    setTabs(next);

    // If closing the active tab, activate the nearest remaining tab
    setActiveTabPath((currentActive) => {
      if (currentActive !== path) return currentActive;
      if (next.length === 0) return null;
      const nearestIdx = Math.min(idx, next.length - 1);
      return next[nearestIdx].path;
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
