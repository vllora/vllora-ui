import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react';
import {
  Dataset,
  DatasetSummary,
  Trace,
  PipelineStep,
  NodeStatus,
  DetectedPattern,
  CoverageGap,
} from './types';
import {
  mockDatasets,
  mockDatasetSummaries,
  mockTraces,
  mockDetectedPattern,
  mockCoverageGaps,
  generateMockRecords,
} from './mockData';

interface FinetuneContextValue {
  // Dataset List
  datasetSummaries: DatasetSummary[];
  loadingDatasets: boolean;

  // Current Dataset
  currentDataset: Dataset | null;
  loadingCurrentDataset: boolean;
  setCurrentDatasetId: (id: string | null) => void;

  // Selected Node
  selectedNodeId: PipelineStep | null;
  setSelectedNodeId: (id: PipelineStep | null) => void;

  // Traces (for create dataset)
  traces: Trace[];
  loadingTraces: boolean;
  selectedTraceIds: Set<string>;
  toggleTraceSelection: (id: string) => void;
  selectAllTraces: () => void;
  clearTraceSelection: () => void;

  // Detected Pattern
  detectedPattern: DetectedPattern | null;

  // Coverage Gaps
  coverageGaps: CoverageGap[];

  // Records Overlay
  isRecordsOverlayOpen: boolean;
  recordsFilter: string | null;
  openRecordsOverlay: (filter?: string) => void;
  closeRecordsOverlay: () => void;

  // Actions
  createDataset: (name: string, objective: string, traceIds: string[]) => Promise<string>;
  updateNodeStatus: (nodeId: PipelineStep, status: NodeStatus, summary?: string) => void;
  runStep: (stepId: PipelineStep) => Promise<void>;
  deleteDataset: (id: string) => Promise<void>;
  duplicateDataset: (id: string) => Promise<string>;

  // UI State
  isDetailPanelCollapsed: boolean;
  toggleDetailPanel: () => void;
}

const FinetuneContext = createContext<FinetuneContextValue | null>(null);

export function FinetuneProvider({ children }: { children: ReactNode }) {
  // Dataset List State
  const [datasetSummaries, setDatasetSummaries] = useState<DatasetSummary[]>(mockDatasetSummaries);
  const [loadingDatasets] = useState(false);

  // Current Dataset State
  const [currentDatasetId, setCurrentDatasetIdState] = useState<string | null>(null);
  const [loadingCurrentDataset, setLoadingCurrentDataset] = useState(false);

  // Selected Node State
  const [selectedNodeId, setSelectedNodeId] = useState<PipelineStep | null>(null);

  // Traces State
  const [traces] = useState<Trace[]>(mockTraces);
  const [loadingTraces] = useState(false);
  const [selectedTraceIds, setSelectedTraceIds] = useState<Set<string>>(new Set());

  // Records Overlay State
  const [isRecordsOverlayOpen, setIsRecordsOverlayOpen] = useState(false);
  const [recordsFilter, setRecordsFilter] = useState<string | null>(null);

  // UI State
  const [isDetailPanelCollapsed, setIsDetailPanelCollapsed] = useState(false);

  // Compute current dataset from mock data
  const currentDataset = useMemo(() => {
    if (!currentDatasetId) return null;
    return mockDatasets[currentDatasetId] || null;
  }, [currentDatasetId]);

  // Set current dataset ID with loading simulation
  const setCurrentDatasetId = useCallback((id: string | null) => {
    if (id) {
      setLoadingCurrentDataset(true);
      setTimeout(() => {
        setCurrentDatasetIdState(id);
        setLoadingCurrentDataset(false);
        // Auto-select the first incomplete step
        const dataset = mockDatasets[id];
        if (dataset) {
          const incompleteNode = dataset.pipelineNodes.find(n => n.status !== 'complete');
          if (incompleteNode) {
            setSelectedNodeId(incompleteNode.id);
          }
        }
      }, 300);
    } else {
      setCurrentDatasetIdState(null);
      setSelectedNodeId(null);
    }
  }, []);

  // Trace selection handlers
  const toggleTraceSelection = useCallback((id: string) => {
    setSelectedTraceIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const selectAllTraces = useCallback(() => {
    setSelectedTraceIds(new Set(traces.map(t => t.id)));
  }, [traces]);

  const clearTraceSelection = useCallback(() => {
    setSelectedTraceIds(new Set());
  }, []);

  // Detected pattern based on selection
  const detectedPattern = useMemo(() => {
    if (selectedTraceIds.size === 0) return null;
    return mockDetectedPattern;
  }, [selectedTraceIds]);

  // Coverage gaps
  const coverageGaps = useMemo(() => {
    if (!currentDataset || currentDataset.pipelineNodes[2].status === 'waiting') {
      return [];
    }
    return mockCoverageGaps;
  }, [currentDataset]);

  // Records Overlay handlers
  const openRecordsOverlay = useCallback((filter?: string) => {
    setRecordsFilter(filter || null);
    setIsRecordsOverlayOpen(true);
  }, []);

  const closeRecordsOverlay = useCallback(() => {
    setIsRecordsOverlayOpen(false);
    setRecordsFilter(null);
  }, []);

  // Create Dataset
  const createDataset = useCallback(async (name: string, objective: string, traceIds: string[]): Promise<string> => {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 500));

    const id = `${name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;
    const newDataset: Dataset = {
      id,
      name,
      objective,
      records: generateMockRecords(traceIds.length),
      topicHierarchy: { topics: [] },
      pipelineNodes: [
        { id: 1, name: 'Extract Records', shortName: 'Extract', status: 'complete', summary: `${traceIds.length} records`, canRetrigger: true, category: 'data-prep' },
        { id: 2, name: 'Topics & Categorization', shortName: 'Topics', status: 'running', summary: 'Processing...', canRetrigger: true, category: 'data-prep' },
        { id: 3, name: 'Review Coverage', shortName: 'Coverage', status: 'waiting', summary: '', canRetrigger: true, category: 'data-prep' },
        { id: 4, name: 'Define Grader', shortName: 'Grader', status: 'waiting', summary: '', canRetrigger: true, category: 'validation' },
        { id: 5, name: 'Dry Run', shortName: 'Dry Run', status: 'waiting', summary: '', canRetrigger: true, category: 'validation' },
        { id: 6, name: 'Train Model', shortName: 'Train', status: 'waiting', summary: '', canRetrigger: true, category: 'training' },
        { id: 7, name: 'Deploy', shortName: 'Deploy', status: 'waiting', summary: '', canRetrigger: false, category: 'training' },
      ],
      validRecordCount: Math.floor(traceIds.length * 0.97),
      invalidRecordCount: Math.floor(traceIds.length * 0.03),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Add to mock data
    mockDatasets[id] = newDataset;

    const summary: DatasetSummary = {
      id,
      name,
      recordCount: traceIds.length,
      topicCount: 0,
      balanceScore: 0,
      currentStep: 2,
      status: 'in_progress',
      statusText: 'Step 2: Categorizing records...',
      updatedAt: new Date(),
    };

    setDatasetSummaries(prev => [summary, ...prev]);

    return id;
  }, []);

  // Update Node Status
  const updateNodeStatus = useCallback((nodeId: PipelineStep, status: NodeStatus, summary?: string) => {
    if (!currentDatasetId) return;

    const dataset = mockDatasets[currentDatasetId];
    if (!dataset) return;

    const nodeIndex = dataset.pipelineNodes.findIndex(n => n.id === nodeId);
    if (nodeIndex !== -1) {
      dataset.pipelineNodes[nodeIndex].status = status;
      if (summary) {
        dataset.pipelineNodes[nodeIndex].summary = summary;
      }
    }
  }, [currentDatasetId]);

  // Run Step (simulated)
  const runStep = useCallback(async (stepId: PipelineStep) => {
    if (!currentDatasetId) return;

    updateNodeStatus(stepId, 'running', 'Processing...');

    // Simulate step execution
    await new Promise(resolve => setTimeout(resolve, 2000));

    const summaries: Record<PipelineStep, string> = {
      1: '1,042 records',
      2: '7 topics, 100%',
      3: 'Score: 0.72',
      4: 'LLM Judge',
      5: 'GO 0.45',
      6: '+49%',
      7: 'Live',
    };

    updateNodeStatus(stepId, 'complete', summaries[stepId]);
  }, [currentDatasetId, updateNodeStatus]);

  // Delete Dataset
  const deleteDataset = useCallback(async (id: string) => {
    await new Promise(resolve => setTimeout(resolve, 300));
    delete mockDatasets[id];
    setDatasetSummaries(prev => prev.filter(d => d.id !== id));
  }, []);

  // Duplicate Dataset
  const duplicateDataset = useCallback(async (id: string): Promise<string> => {
    await new Promise(resolve => setTimeout(resolve, 300));
    const original = mockDatasets[id];
    if (!original) throw new Error('Dataset not found');

    const newId = `${original.name}-copy-${Date.now()}`;
    mockDatasets[newId] = { ...original, id: newId, name: `${original.name}-copy` };

    const summary = datasetSummaries.find(s => s.id === id);
    if (summary) {
      setDatasetSummaries(prev => [{ ...summary, id: newId, name: `${summary.name}-copy` }, ...prev]);
    }

    return newId;
  }, [datasetSummaries]);

  // Toggle Detail Panel
  const toggleDetailPanel = useCallback(() => {
    setIsDetailPanelCollapsed(prev => !prev);
  }, []);

  const value: FinetuneContextValue = {
    datasetSummaries,
    loadingDatasets,
    currentDataset,
    loadingCurrentDataset,
    setCurrentDatasetId,
    selectedNodeId,
    setSelectedNodeId,
    traces,
    loadingTraces,
    selectedTraceIds,
    toggleTraceSelection,
    selectAllTraces,
    clearTraceSelection,
    detectedPattern,
    coverageGaps,
    isRecordsOverlayOpen,
    recordsFilter,
    openRecordsOverlay,
    closeRecordsOverlay,
    createDataset,
    updateNodeStatus,
    runStep,
    deleteDataset,
    duplicateDataset,
    isDetailPanelCollapsed,
    toggleDetailPanel,
  };

  return (
    <FinetuneContext.Provider value={value}>
      {children}
    </FinetuneContext.Provider>
  );
}

export function useFinetuneContext() {
  const context = useContext(FinetuneContext);
  if (!context) {
    throw new Error('useFinetuneContext must be used within a FinetuneProvider');
  }
  return context;
}
