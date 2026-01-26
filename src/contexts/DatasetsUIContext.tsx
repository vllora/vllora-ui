/**
 * DatasetsUIContext
 *
 * Manages UI state for the Datasets page using Provider/Consumer pattern.
 * Handles navigation, selection, search, sort, and Lucy tool events.
 */

import { createContext, useContext, ReactNode, useCallback, useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DatasetsConsumer } from './DatasetsContext';
import { emitter } from '@/utils/eventEmitter';
import type { SortConfig } from '@/components/datasets/RecordsToolbar';
import { listSpans } from '@/services/spans-api';
import { ProjectEventsConsumer } from '@/contexts/project-events';
import type { ProjectEventUnion, CustomEvent } from '@/contexts/project-events/dto';

// ============================================================================
// Types
// ============================================================================

export type DatasetViewMode = 'standard' | 'finetune';

interface DatasetsUIContextType {
  // Data state
  datasets: { id: string; name: string }[];
  isLoading: boolean;

  // Backend spans state
  hasBackendSpans: boolean;
  isCheckingSpans: boolean;
  checkBackendSpans: () => Promise<void>;

  // Navigation state
  selectedDatasetId: string | null;
  currentDataset: { id: string; name: string } | null;

  // View mode
  viewMode: DatasetViewMode;
  setViewMode: (mode: DatasetViewMode) => void;

  // Selection state
  selectedRecordIds: Set<string>;
  expandedDatasetIds: Set<string>;

  // Search and sort
  searchQuery: string;
  sortConfig: SortConfig | undefined;

  // Navigation actions
  navigateToDataset: (datasetId: string) => void;
  navigateToList: () => void;

  // Selection actions
  setSelectedRecordIds: (ids: Set<string>) => void;
  selectRecords: (recordIds: string[]) => void;
  clearSelection: () => void;

  // Expand/collapse actions
  expandDataset: (datasetId: string) => void;
  collapseDataset: (datasetId: string) => void;

  // Search and sort actions
  setSearchQuery: (query: string) => void;
  setSortConfig: (config: SortConfig | undefined) => void;
}

// ============================================================================
// Context
// ============================================================================

const DatasetsUIContext = createContext<DatasetsUIContextType | undefined>(undefined);

// ============================================================================
// Provider
// ============================================================================

export function DatasetsUIProvider({ children }: { children: ReactNode }) {
  const { datasets, loadDatasets, isLoading } = DatasetsConsumer();
  const { subscribe, projectId } = ProjectEventsConsumer();

  // URL params for dataset detail view
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedDatasetId = searchParams.get('id');

  // UI state
  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig | undefined>();
  const [expandedDatasetIds, setExpandedDatasetIds] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<DatasetViewMode>('standard');

  // Backend spans state
  const [hasBackendSpans, setHasBackendSpans] = useState(false);
  const [isCheckingSpans, setIsCheckingSpans] = useState(false);
  const hasCheckedSpansRef = useRef(false);

  // Function to check if spans exist in backend
  const checkBackendSpans = useCallback(async () => {
    if (!projectId) return;

    setIsCheckingSpans(true);
    try {
      const response = await listSpans({
        projectId,
        params: { limit: 1 }
      });
      setHasBackendSpans(response.pagination.total > 0);
    } catch (error) {
      console.error('Failed to check backend spans:', error);
      setHasBackendSpans(false);
    } finally {
      setIsCheckingSpans(false);
    }
  }, [projectId]);

  // Check for spans on mount and when projectId changes
  useEffect(() => {
    if (projectId && !hasCheckedSpansRef.current) {
      hasCheckedSpansRef.current = true;
      checkBackendSpans();
    }
  }, [projectId, checkBackendSpans]);

  // Reset check flag when projectId changes
  useEffect(() => {
    hasCheckedSpansRef.current = false;
  }, [projectId]);

  // Subscribe to span events from ProjectEventsContext
  useEffect(() => {
    if (!projectId) return;

    // Filter for span_end events (indicates a complete span)
    const unsubscribe = subscribe(
      'datasets-ui-span-listener',
      () => {
        // When we receive a span event, we know spans exist
        if (!hasBackendSpans) {
          setHasBackendSpans(true);
        }
      },
      (event: ProjectEventUnion) => {
        // Filter for Custom events that are span_start or span_end
        if (event.type === 'Custom') {
          const customEvent = event as CustomEvent;
          return customEvent.event?.type === 'span_start' || customEvent.event?.type === 'span_end';
        }
        return false;
      }
    );

    return unsubscribe;
  }, [projectId, subscribe, hasBackendSpans]);

  // Derived state
  const currentDataset = useMemo(() => {
    if (!selectedDatasetId) return null;
    const dataset = datasets.find(d => d.id === selectedDatasetId);
    return dataset ? { id: dataset.id, name: dataset.name } : null;
  }, [datasets, selectedDatasetId]);

  // Navigation actions
  const navigateToDataset = useCallback((datasetId: string) => {
    setSearchParams({ id: datasetId });
    // Clear selection when navigating
    setSelectedRecordIds(new Set());
    setSearchQuery('');
    setSortConfig(undefined);
  }, [setSearchParams]);

  const navigateToList = useCallback(() => {
    setSearchParams({});
    setSelectedRecordIds(new Set());
    setSearchQuery('');
    setSortConfig(undefined);
  }, [setSearchParams]);

  // Selection actions
  const selectRecords = useCallback((recordIds: string[]) => {
    setSelectedRecordIds(new Set(recordIds));
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedRecordIds(new Set());
  }, []);

  // Expand/collapse actions
  const expandDataset = useCallback((datasetId: string) => {
    setExpandedDatasetIds(prev => new Set([...prev, datasetId]));
  }, []);

  const collapseDataset = useCallback((datasetId: string) => {
    setExpandedDatasetIds(prev => {
      const next = new Set(prev);
      next.delete(datasetId);
      return next;
    });
  }, []);

  // Listen for Lucy tool events
  useEffect(() => {
    // Navigation handlers
    const handleNavigate = (data: { datasetId: string }) => {
      navigateToDataset(data.datasetId);
    };

    const handleNavigateToList = () => {
      navigateToList();
    };

    const handleExpand = (data: { datasetId: string }) => {
      expandDataset(data.datasetId);
    };

    const handleCollapse = (data: { datasetId: string }) => {
      collapseDataset(data.datasetId);
    };

    // Selection handlers
    const handleSelectRecords = (data: { datasetId: string; recordIds: string[] }) => {
      // Navigate to the dataset first, then select records
      if (data.datasetId && data.datasetId !== selectedDatasetId) {
        setSearchParams({ id: data.datasetId });
      }
      selectRecords(data.recordIds);
    };

    const handleClearSelection = () => {
      clearSelection();
    };

    // Search and sort handlers
    const handleSetSearch = (data: { query: string }) => {
      setSearchQuery(data.query);
    };

    const handleSetSort = (data: { field: string; direction: 'asc' | 'desc' }) => {
      setSortConfig({ field: data.field as SortConfig['field'], direction: data.direction });
    };

    // Refresh handler (delegates to DatasetsContext)
    const handleRefresh = () => {
      loadDatasets();
    };

    // Register event listeners
    emitter.on('vllora_dataset_navigate' as any, handleNavigate);
    emitter.on('vllora_dataset_navigate_to_list' as any, handleNavigateToList);
    emitter.on('vllora_dataset_expand' as any, handleExpand);
    emitter.on('vllora_dataset_collapse' as any, handleCollapse);
    emitter.on('vllora_dataset_select_records' as any, handleSelectRecords);
    emitter.on('vllora_dataset_clear_selection' as any, handleClearSelection);
    emitter.on('vllora_dataset_set_search' as any, handleSetSearch);
    emitter.on('vllora_dataset_set_sort' as any, handleSetSort);
    emitter.on('vllora_dataset_refresh' as any, handleRefresh);

    // Cleanup
    return () => {
      emitter.off('vllora_dataset_navigate' as any, handleNavigate);
      emitter.off('vllora_dataset_navigate_to_list' as any, handleNavigateToList);
      emitter.off('vllora_dataset_expand' as any, handleExpand);
      emitter.off('vllora_dataset_collapse' as any, handleCollapse);
      emitter.off('vllora_dataset_select_records' as any, handleSelectRecords);
      emitter.off('vllora_dataset_clear_selection' as any, handleClearSelection);
      emitter.off('vllora_dataset_set_search' as any, handleSetSearch);
      emitter.off('vllora_dataset_set_sort' as any, handleSetSort);
      emitter.off('vllora_dataset_refresh' as any, handleRefresh);
    };
  }, [navigateToDataset, navigateToList, expandDataset, collapseDataset, selectRecords, clearSelection, loadDatasets, selectedDatasetId, setSearchParams]);

  const value: DatasetsUIContextType = {
    // Data state
    datasets,
    isLoading,

    // Backend spans state
    hasBackendSpans,
    isCheckingSpans,
    checkBackendSpans,

    // Navigation state
    selectedDatasetId,
    currentDataset,

    // View mode
    viewMode,
    setViewMode,

    // Selection state
    selectedRecordIds,
    expandedDatasetIds,

    // Search and sort
    searchQuery,
    sortConfig,

    // Navigation actions
    navigateToDataset,
    navigateToList,

    // Selection actions
    setSelectedRecordIds,
    selectRecords,
    clearSelection,

    // Expand/collapse actions
    expandDataset,
    collapseDataset,

    // Search and sort actions
    setSearchQuery,
    setSortConfig,
  };

  return <DatasetsUIContext.Provider value={value}>{children}</DatasetsUIContext.Provider>;
}

// ============================================================================
// Consumer
// ============================================================================

export function DatasetsUIConsumer() {
  const context = useContext(DatasetsUIContext);
  if (context === undefined) {
    throw new Error('DatasetsUIConsumer must be used within a DatasetsUIProvider');
  }
  return context;
}
