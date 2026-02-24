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
}
