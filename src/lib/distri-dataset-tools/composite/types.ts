/**
 * Composite Dataset Tools - Shared Types
 *
 * All composite tools receive the full orchestrator context.
 * This matches the context object built in datasets/index.tsx
 */

/**
 * Full context passed from orchestrator to all composite tools.
 */
export interface DatasetContext {
  page: string;
  current_view: string;
  current_dataset_id?: string;
  current_dataset_name?: string;
  datasets_count: number;
  dataset_names: Array<{ id: string; name: string }>;
  selected_records_count: number;
  selected_record_ids?: string[];
  search_query?: string;
  sort_config: { field: string; direction: string };
  expanded_dataset_ids?: string[];
}

/**
 * Base interface for all composite tool params
 */
export interface CompositeToolParams {
  context: DatasetContext;
}
