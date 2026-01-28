/**
 * DatasetsUIContext
 *
 * Manages UI state for the Datasets page using Provider/Consumer pattern.
 * Handles navigation, selection, search, sort, and Lucy tool events.
 */

import { createContext, useContext, ReactNode, useCallback, useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { DatasetsConsumer } from './DatasetsContext';
import { emitter } from '@/utils/eventEmitter';
import type { SortConfig } from '@/components/datasets/RecordsToolbar';
import { listSpans } from '@/services/spans-api';
import { ProjectEventsConsumer } from '@/contexts/project-events';
import type { ProjectEventUnion, CustomEvent } from '@/contexts/project-events/dto';

// ============================================================================
// Types
// ============================================================================

interface DatasetsUIContextType {
  // Data state
  datasets: { id: string; name: string }[];
  isLoading: boolean;

  // Backend spans state
  hasBackendSpans: boolean;
  isCheckingSpans: boolean;
  checkBackendSpans: () => Promise<void>;

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
  const navigate = useNavigate();

  // UI state
  const [selectedRecordIds, setSelectedRecordIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [sortConfig, setSortConfig] = useState<SortConfig | undefined>();
  const [expandedDatasetIds, setExpandedDatasetIds] = useState<Set<string>>(new Set());

  // Backend spans state
  const [hasBackendSpans, setHasBackendSpans] = useState(false);
  const [isCheckingSpans, setIsCheckingSpans] = useState(false);
  const hasBackendSpansRef = useRef(hasBackendSpans);

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
    if (!projectId) return;
    checkBackendSpans();
  }, [projectId, checkBackendSpans]);

  // Keep ref in sync with state
  useEffect(() => {
    hasBackendSpansRef.current = hasBackendSpans;
  }, [hasBackendSpans]);

  // Subscribe to span events from ProjectEventsContext
  useEffect(() => {
    if (!projectId) return;
    const unsubscribe = subscribe(
      'datasets-ui-span-listener',
      (_event: ProjectEventUnion) => {
        // When we receive a span event, we know spans exist
        // Use ref to avoid re-subscribing when state changes
        if (!hasBackendSpansRef.current) {
          console.log('===== setHasBackendSpans to true')
          setHasBackendSpans(true);
        }
      },
      (event: ProjectEventUnion) => {
        // Filter for StateSnapshot with span_id or Custom span events
        if (event.type === 'StateSnapshot') {
          return !!event.span_id;
        }
        if (event.type === 'Custom') {
          const customEvent = event as CustomEvent;
          return customEvent.event?.type === 'span_start' || customEvent.event?.type === 'span_end';
        }
        return false;
      }
    );

    return unsubscribe;
  }, [projectId, subscribe]);

  // Navigation actions - use path-based routing
  const navigateToDataset = useCallback((datasetId: string) => {
    navigate(`/datasets/${datasetId}`);
    // Clear selection when navigating
    setSelectedRecordIds(new Set());
    setSearchQuery('');
    setSortConfig(undefined);
  }, [navigate]);

  const navigateToList = useCallback(() => {
    navigate('/datasets');
    setSelectedRecordIds(new Set());
    setSearchQuery('');
    setSortConfig(undefined);
  }, [navigate]);

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
      if (data.datasetId) {
        navigate(`/datasets/${data.datasetId}`);
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
  }, [navigateToDataset, navigateToList, expandDataset, collapseDataset, selectRecords, clearSelection, loadDatasets, navigate]);

  const value: DatasetsUIContextType = {
    // Data state
    datasets,
    isLoading,

    // Backend spans state
    hasBackendSpans,
    isCheckingSpans,
    checkBackendSpans,

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
