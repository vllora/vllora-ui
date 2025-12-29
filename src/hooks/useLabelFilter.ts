import { useState, useCallback, useMemo } from 'react';
import { useRequest } from 'ahooks';
import { listLabels, LabelInfo } from '@/services/labels-api';

export interface UseLabelFilterOptions {
  projectId: string;
  threadId?: string;
  /** Initial selected labels */
  initialLabels?: string[];
  /** Whether to auto-fetch labels on mount */
  autoFetch?: boolean;
}

export interface UseLabelFilterReturn {
  // State
  selectedLabels: string[];

  // Available labels from API
  availableLabels: LabelInfo[];
  isLoading: boolean;
  error: Error | undefined;

  // Actions
  addLabel: (label: string) => void;
  removeLabel: (label: string) => void;
  toggleLabel: (label: string) => void;
  setLabels: (labels: string[]) => void;
  clearLabels: () => void;

  // API actions
  fetchLabels: () => void;

  // Search/filter helpers
  searchLabels: (query: string) => LabelInfo[];

  // Computed
  hasSelection: boolean;
  selectionCount: number;

  // For building API query params
  labelsQueryParam: string | undefined;
}

/**
 * Hook for managing label filtering state
 *
 * @example
 * // Thread-scoped labels
 * const { selectedLabels, availableLabels, toggleLabel, clearLabels } = useLabelFilter({
 *   projectId: 'proj-123',
 *   threadId: 'thread-abc',
 * });
 *
 * @example
 * // Project-wide labels
 * const { selectedLabels, availableLabels } = useLabelFilter({
 *   projectId: 'proj-123',
 * });
 */
export function useLabelFilter({
  projectId,
  threadId,
  initialLabels = [],
  autoFetch = true,
}: UseLabelFilterOptions): UseLabelFilterReturn {
  // Selected labels state
  const [selectedLabels, setSelectedLabels] = useState<string[]>(initialLabels);

  // Fetch available labels from API
  const {
    data: labelsResponse,
    loading: isLoading,
    error,
    run: fetchLabels,
  } = useRequest(
    async () => {
      if (!projectId) {
        return { labels: [] };
      }
      return listLabels({
        projectId,
        params: threadId ? { threadId } : undefined,
      });
    },
    {
      manual: !autoFetch,
      refreshDeps: [projectId, threadId],
    }
  );

  const availableLabels = useMemo(() => {
    return labelsResponse?.labels || [];
  }, [labelsResponse]);

  // Actions
  const addLabel = useCallback((label: string) => {
    setSelectedLabels(prev => {
      if (prev.includes(label)) return prev;
      return [...prev, label];
    });
  }, []);

  const removeLabel = useCallback((label: string) => {
    setSelectedLabels(prev => prev.filter(l => l !== label));
  }, []);

  const toggleLabel = useCallback((label: string) => {
    setSelectedLabels(prev => {
      if (prev.includes(label)) {
        return prev.filter(l => l !== label);
      }
      return [...prev, label];
    });
  }, []);

  const setLabels = useCallback((labels: string[]) => {
    setSelectedLabels(labels);
  }, []);

  const clearLabels = useCallback(() => {
    setSelectedLabels([]);
  }, []);

  // Search helper - fuzzy search through available labels
  const searchLabels = useCallback((query: string): LabelInfo[] => {
    if (!query.trim()) {
      return availableLabels;
    }
    const lowerQuery = query.toLowerCase();
    return availableLabels.filter(label =>
      label.name.toLowerCase().includes(lowerQuery)
    );
  }, [availableLabels]);

  // Computed values
  const hasSelection = selectedLabels.length > 0;
  const selectionCount = selectedLabels.length;

  // Build query param for API calls
  const labelsQueryParam = useMemo(() => {
    if (selectedLabels.length === 0) return undefined;
    return selectedLabels.join(',');
  }, [selectedLabels]);

  return {
    // State
    selectedLabels,

    // Available labels
    availableLabels,
    isLoading,
    error,

    // Actions
    addLabel,
    removeLabel,
    toggleLabel,
    setLabels,
    clearLabels,

    // API actions
    fetchLabels,

    // Search
    searchLabels,

    // Computed
    hasSelection,
    selectionCount,

    // Query param helper
    labelsQueryParam,
  };
}
