/**
 * Helper type definitions for DatasetDetailContext
 * Main context type is auto-inferred via ReturnType<typeof useDatasetDetail>
 */

export type GeneratedFilter = "all" | "generated" | "not_generated";

export interface AutoTagProgress {
  completed: number;
  total: number;
}
