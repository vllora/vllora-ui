/**
 * Table column width constants
 *
 * Shared between TableHeader and cell components to ensure alignment.
 */

export const COLUMN_WIDTHS = {
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
