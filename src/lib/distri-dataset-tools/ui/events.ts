/**
 * Dataset UI Events
 *
 * Event types emitted by UI tools and listened to by Datasets page components.
 */

export type DatasetUiEvents = {
  // Dataset navigation
  vllora_dataset_navigate: { datasetId: string };
  vllora_dataset_navigate_to_list: Record<string, never>;
  vllora_dataset_expand: { datasetId: string };
  vllora_dataset_collapse: { datasetId: string };

  // Record selection
  vllora_dataset_select_records: { recordIds: string[] };
  vllora_dataset_clear_selection: Record<string, never>;

  // Record editor
  vllora_dataset_open_editor: { recordId: string };
  vllora_dataset_close_editor: Record<string, never>;

  // Search and sort
  vllora_dataset_set_search: { query: string };
  vllora_dataset_set_sort: { field: string; direction: 'asc' | 'desc' };

  // Dialogs
  vllora_dataset_show_assign_topic: Record<string, never>;

  // Export
  vllora_dataset_export: { datasetId: string };

  // Refresh trigger (data changed)
  vllora_dataset_refresh: Record<string, never>;
};
