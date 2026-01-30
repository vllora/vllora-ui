/**
 * Table column width constants
 *
 * Shared between TableHeader and cell components to ensure alignment.
 */

export const COLUMN_WIDTHS = {
  /** Row index column - fixed for small icon */
  index: "w-8 shrink-0",
  /** Checkbox column - fixed for small icon */
  checkbox: "w-6 shrink-0",
  /** Data column (flex) */
  data: "flex-[2] min-w-0",
  /** Source column - flex based */
  source: "flex-[0.8] min-w-0",
  /** Topic column - flex based */
  topic: "flex-[1] min-w-0",
  /** Evaluation column - flex based */
  evaluation: "flex-[1] min-w-0",
  /** Timestamp column - flex based */
  timestamp: "flex-[1.2] min-w-0",
  /** Actions column - fixed for small icon */
  actions: "w-12 shrink-0",
  /** Conversation thread column (new layout) - main content, largest flex */
  thread: "flex-[3] min-w-0",
  /** Tools badge column (new layout) - flex based */
  tools: "flex-[0.8] min-w-0",
  /** Strategy/topic column (new layout) - flex based */
  strategy: "flex-[1.2] min-w-0",
  /** Stats column (new layout) - flex based */
  stats: "flex-[1] min-w-0",
  /** Actions dropdown column (new layout) - fixed for small icon */
  deepDiveActions: "w-10 shrink-0",
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
