/**
 * Table column width constants
 *
 * Shared between TableHeader and cell components to ensure alignment.
 */

export const COLUMN_WIDTHS = {
  /** Row index column */
  index: "w-8 shrink-0",
  /** Checkbox column */
  checkbox: "w-6 shrink-0",
  /** Data column (flex) */
  data: "flex-[2] min-w-0",
  /** Source column */
  source: "w-24 shrink-0",
  /** Topic column */
  topic: "w-28 shrink-0",
  /** Evaluation column */
  evaluation: "w-28 shrink-0",
  /** Timestamp column */
  timestamp: "w-36 shrink-0",
  /** Actions column */
  actions: "w-16 shrink-0",
} as const;

/** Columns that can be toggled by the user */
export type ToggleableColumn = "index" | "source" | "topic" | "evaluation" | "timestamp";

/** Column visibility configuration */
export interface ColumnVisibility {
  index: boolean;
  source: boolean;
  topic: boolean;
  evaluation: boolean;
  timestamp: boolean;
}

/** Default column visibility - all columns visible */
export const DEFAULT_COLUMN_VISIBILITY: ColumnVisibility = {
  index: true,
  source: true,
  topic: true,
  evaluation: true,
  timestamp: true,
};

/** Column labels for the visibility dropdown */
export const COLUMN_LABELS: Record<ToggleableColumn, string> = {
  index: "Row #",
  source: "Source",
  topic: "Topic",
  evaluation: "Evaluation",
  timestamp: "Updated At",
};

/** localStorage key for column visibility */
export const COLUMN_VISIBILITY_STORAGE_KEY = "vllora:dataset-column-visibility";
