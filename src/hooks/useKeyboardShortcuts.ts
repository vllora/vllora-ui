/**
 * useKeyboardShortcuts
 *
 * Global keyboard shortcuts for the dataset detail view.
 * - 1/2/3: Switch to Canvas/Sources/Table
 * - Esc: Close drawer, sidebar, zoom out
 * - ?: Toggle keyboard shortcuts help
 */

import { useEffect, useCallback } from "react";
import type { ViewMode } from "@/components/datasets/dataset-detail-header/ViewModeToggle";

interface UseKeyboardShortcutsOptions {
  onViewModeChange: (mode: ViewMode) => void;
  onEscape?: () => void;
  onToggleHelp?: () => void;
  /** Disable shortcuts (e.g., when an input is focused) */
  disabled?: boolean;
}

export function useKeyboardShortcuts({
  onViewModeChange,
  onEscape,
  onToggleHelp,
  disabled = false,
}: UseKeyboardShortcutsOptions) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (disabled) return;

    // Skip when typing in inputs, textareas, or contenteditable elements
    const target = e.target as HTMLElement;
    const isInput = target.tagName === "INPUT"
      || target.tagName === "TEXTAREA"
      || target.tagName === "SELECT"
      || target.isContentEditable;
    if (isInput) return;

    // Skip when modifier keys are held (allow browser/OS shortcuts)
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    switch (e.key) {
      case "1":
        e.preventDefault();
        onViewModeChange("canvas");
        break;
      case "2":
        e.preventDefault();
        onViewModeChange("sources");
        break;
      case "3":
        e.preventDefault();
        onViewModeChange("table");
        break;
      case "Escape":
        onEscape?.();
        break;
      case "?":
        e.preventDefault();
        onToggleHelp?.();
        break;
    }
  }, [disabled, onViewModeChange, onEscape, onToggleHelp]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
