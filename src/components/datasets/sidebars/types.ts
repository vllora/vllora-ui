/**
 * File Tree Types
 *
 * Shared types for the virtual file tree in the Dataset Explorer.
 * Each node represents a virtual file or folder mapped to real data
 * in IndexedDB, React contexts, or computed state.
 */

import type { ReactNode } from "react";

export type BadgeVariant = "default" | "success" | "warning" | "error" | "loading" | "count";

export interface FileTreeBadge {
  label: string;
  variant: BadgeVariant;
  /** Optional icon to render instead of the text label */
  icon?: ReactNode;
  /** Tooltip text shown on hover (falls back to label) */
  tooltip?: string;
}

/** VS Code-style hover action button for tree nodes */
export interface FileTreeAction {
  /** Unique key for React list rendering */
  key: string;
  /** Icon (lucide ReactNode, sized w-3.5 h-3.5) */
  icon: ReactNode;
  /** Tooltip text */
  title: string;
  /** Click handler — receives the mouse event (already stopPropagation'd) */
  onClick: () => void;
  /** Optional: disable the action */
  disabled?: boolean;
}

export interface FileTreeNode {
  /** Unique identifier — also used as the virtual path */
  id: string;
  /** Display name (e.g., "readme.md", "openings/") */
  name: string;
  /** Node type */
  type: "file" | "folder";
  /** Custom icon (lucide ReactNode) */
  icon?: ReactNode;
  /** Optional status badge */
  badge?: FileTreeBadge;
  /** Children nodes (folders only) */
  children?: FileTreeNode[];
  /** Whether the folder can be expanded (defaults to true for folders with children) */
  isExpandable?: boolean;
  /** Optional native tooltip text (shown on hover) */
  title?: string;
  /** Optional hover actions (VS Code-style buttons that appear on hover) */
  actions?: FileTreeAction[];
}
