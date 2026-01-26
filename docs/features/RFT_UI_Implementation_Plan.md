# RFT Fine-Tuning UI - Implementation Plan

## Document Info
- **Version:** 1.0
- **Created:** January 26, 2026
- **Based on:** finetune-process spec v3.6

---

## Table of Contents

1. [Overview](#overview)
2. [Tech Stack & Conventions](#tech-stack--conventions)
3. [Phase 1: Foundation](#phase-1-foundation)
4. [Phase 2: Datasets List Page](#phase-2-datasets-list-page)
5. [Phase 3: Create Dataset Page](#phase-3-create-dataset-page)
6. [Phase 4: Dataset Canvas View](#phase-4-dataset-canvas-view)
7. [Phase 5: Step Modals](#phase-5-step-modals)
8. [Phase 6: Records Overlay](#phase-6-records-overlay)
9. [Phase 7: Settings Page](#phase-7-settings-page)
10. [Phase 8: API Integration](#phase-8-api-integration)
11. [Implementation Timeline](#implementation-timeline)

---

## Overview

### Goal
Build a visual pipeline interface that lets users create RFT (Reinforcement Fine-Tuned) models from LLM gateway traces in a few clicks.

### Routes

| Route | Page | Description |
|-------|------|-------------|
| `/optimization` | Datasets List | View all datasets, create new |
| `/optimization/new` | Create Dataset | Select traces or upload file |
| `/optimization/:id` | Dataset Canvas | Main pipeline view |
| `/optimization/:id/settings` | Settings | Dataset configuration |

### Key UI Patterns

1. **Canvas-based pipeline** - Visual nodes connected vertically
2. **Modal-driven actions** - Click node → open configuration modal
3. **Persistent health bar** - Validation status always visible
4. **Records overlay** - Contextual record browser

---

## Tech Stack & Conventions

### Libraries Used

| Purpose | Library |
|---------|---------|
| UI Framework | React 19 + TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| Canvas | @xyflow/react (React Flow) |
| State | React Context API |
| Routing | React Router v7 |
| Icons | lucide-react |
| Code Editor | @monaco-editor/react |
| Notifications | sonner |

### File Naming Conventions

```
Components:  PascalCase.tsx     (e.g., PipelineNode.tsx)
Pages:       kebab-case.tsx     (e.g., dataset-canvas.tsx)
Types:       kebab-case.ts      (e.g., optimization-types.ts)
Hooks:       use-camelCase.ts   (e.g., use-pipeline-state.ts)
Contexts:    PascalCaseContext.tsx
```

### Component Structure

```tsx
// Standard component template
import { FC } from 'react';
import { cn } from '@/lib/utils';

interface ComponentNameProps {
  // props
}

export const ComponentName: FC<ComponentNameProps> = ({ ...props }) => {
  return (
    <div className={cn("base-classes")}>
      {/* content */}
    </div>
  );
};
```

---

## Phase 1: Foundation

### 1.1 Type Definitions

**File:** `src/types/optimization-types.ts`

```typescript
// ============================================================
// DATASET TYPES
// ============================================================

export interface OptimizationDataset {
  id: string;
  name: string;
  objective: string;
  source: 'gateway' | 'upload';
  createdAt: string;
  updatedAt: string;
  stats: DatasetStats;
  pipeline: PipelineState;
  topicHierarchy: TopicHierarchy | null;
  graderConfig: GraderConfig | null;
}

export interface DatasetStats {
  totalRecords: number;
  validRecords: number;
  invalidRecords: number;
  generatedRecords: number;
  topicsCount: number;
  balanceScore: number | null;
  dryRunStatus: 'pending' | 'go' | 'no_go' | null;
  dryRunMean: number | null;
  trainingRuns: number;
}

// ============================================================
// PIPELINE TYPES
// ============================================================

export interface PipelineState {
  nodes: PipelineNode[];
  currentStep: number;
}

export interface PipelineNode {
  id: number;
  name: string;
  category: string;
  status: NodeStatus;
  summary: string;
  statusLabel: string;
  canRetrigger: boolean;
}

export type NodeStatus =
  | 'waiting'
  | 'ready'
  | 'processing'
  | 'active'
  | 'complete'
  | 'configured'
  | 'passed'
  | 'attention'
  | 'failed';

export const PIPELINE_STEPS: Omit<PipelineNode, 'status' | 'summary' | 'statusLabel'>[] = [
  { id: 1, name: 'Extract Data', category: 'INGESTION', canRetrigger: true },
  { id: 2, name: 'Topics & Category', category: 'CLASSIFICATION', canRetrigger: true },
  { id: 3, name: 'Coverage Analysis', category: 'DISTRIBUTION', canRetrigger: true },
  { id: 4, name: 'Grader Config', category: 'EVALUATION RULES', canRetrigger: true },
  { id: 5, name: 'Dry Run', category: 'VALIDATION', canRetrigger: true },
  { id: 6, name: 'Train Model', category: 'RFT TRAINING', canRetrigger: false },
  { id: 7, name: 'Deploy', category: 'DEPLOYMENT', canRetrigger: true },
];

// ============================================================
// RECORD TYPES
// ============================================================

export interface DatasetRecord {
  id: string;
  datasetId: string;
  data: DataInfo;
  metadata?: Record<string, unknown>;
  spanId?: string;
  topic?: string | null;
  isGenerated: boolean;
  isValid: boolean;
  validationError?: string;
  dryRunScore?: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface DataInfo {
  input: {
    messages: Message[];
    tools?: Tool[];
    toolChoice?: string;
  };
  output: {
    messages?: Message[] | Message;
    toolCalls?: ToolCall[];
    finishReason?: string;
  };
}

export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface Tool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: object;
  };
}

// ============================================================
// TOPIC TYPES
// ============================================================

export interface TopicHierarchy {
  version: string;
  topics: Record<string, TopicNode>;
}

export interface TopicNode {
  description: string;
  subtopics?: string[];
  keywords?: string[];
  parentTopic?: string;
}

export interface CategorizationResult {
  topic: string;
  confidence: number;
  method: 'embedding' | 'llm' | 'keyword' | 'manual';
  needsReview?: boolean;
}

// ============================================================
// COVERAGE TYPES
// ============================================================

export interface CoverageReport {
  timestamp: string;
  totalRecords: number;
  distribution: Record<string, TopicDistribution>;
  balanceScore: number;
  recommendations: string[];
}

export interface TopicDistribution {
  count: number;
  percentage: number;
  targetPercentage: number;
  gap: number;
  status: 'under' | 'ok' | 'over';
}

// ============================================================
// GRADER TYPES
// ============================================================

export interface GraderConfig {
  type: 'llm-judge' | 'script';

  // For LLM Judge
  prompt?: string;
  outputSchema?: object;
  model?: string;
  temperature?: number;
  maxTokens?: number;

  // For Script
  script?: string;

  // Common
  weight?: number;
}

export interface GraderTestResult {
  sampleId: string;
  score: number;
  reasoning?: string;
  error?: string;
}

// ============================================================
// DRY RUN TYPES
// ============================================================

export interface DryRunReport {
  timestamp: string;
  samplesEvaluated: number;
  statistics: DryRunStatistics;
  distribution: Record<string, number>;
  byTopic: Record<string, { mean: number; count: number }>;
  diagnosis: DryRunDiagnosis;
}

export interface DryRunStatistics {
  mean: number;
  std: number;
  median: number;
  percentiles: {
    p10: number;
    p25: number;
    p75: number;
    p90: number;
  };
  scoreFractions: {
    gtZero: number;
    eqOne: number;
  };
}

export interface DryRunDiagnosis {
  datasetQuality: 'good' | 'attention' | 'problem';
  graderQuality: 'good' | 'attention' | 'problem';
  verdict: 'GO' | 'CAUTION' | 'NO_GO';
  warnings: string[];
  recommendations: string[];
}

// ============================================================
// TRAINING TYPES
// ============================================================

export interface TrainingConfig {
  baseModel: string;
  trainRatio: number;
  stratifyByTopic: boolean;
  includeGeneratedInValid: boolean;
  hyperparameters: {
    nEpochs: number;
    reasoningEffort: 'low' | 'medium' | 'high';
  };
}

export interface TrainingJob {
  id: string;
  datasetId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  currentEpoch: number;
  totalEpochs: number;
  metrics: {
    trainRewardMean: number;
    validRewardMean: number;
  };
  fineTunedModel?: string;
  improvement?: number;
  createdAt: string;
  completedAt?: string;
}

// ============================================================
// GENERATION TYPES
// ============================================================

export type GenerationStrategy =
  | 'message_variation'
  | 'few_shot'
  | 'topic_description'
  | 'scenario_expansion'
  | 'tool_chain';

export interface GenerationConfig {
  strategy: GenerationStrategy;
  variationsPerRecord: number;
  preserveIntent: boolean;
  temperature: number;
  maxSyntheticRatio: number;
}

export interface GenerationPlan {
  totalToGenerate: number;
  byTopic: Record<string, {
    currentCount: number;
    targetCount: number;
    toGenerate: number;
  }>;
  estimatedCost: number;
}

// ============================================================
// UI STATE TYPES
// ============================================================

export interface RecordsOverlayState {
  isOpen: boolean;
  context: RecordsContext | null;
  filters: RecordFilters;
  selectedIds: string[];
}

export interface RecordsContext {
  sourceStep: number;
  label: string;
  presetFilter?: Partial<RecordFilters>;
}

export interface RecordFilters {
  search: string;
  topic: string | null;
  valid: boolean | null;
  source: 'all' | 'traces' | 'generated';
}

export type ActiveModal =
  | null
  | 'records'
  | 'topics'
  | 'coverage'
  | 'generate'
  | 'grader'
  | 'dry-run'
  | 'training'
  | 'deploy'
  | 'import-records'
  | 'import-topics';
```

### 1.2 Context Provider

**File:** `src/contexts/OptimizationContext.tsx`

```tsx
import { createContext, useContext, useState, useCallback, FC, ReactNode } from 'react';
import {
  OptimizationDataset,
  DatasetRecord,
  RecordsOverlayState,
  ActiveModal,
  RecordFilters,
  PipelineNode,
} from '@/types/optimization-types';

// ============================================================
// CONTEXT TYPES
// ============================================================

interface OptimizationContextValue {
  // Dataset state
  dataset: OptimizationDataset | null;
  setDataset: (dataset: OptimizationDataset | null) => void;
  isLoading: boolean;

  // Records state
  records: DatasetRecord[];
  setRecords: (records: DatasetRecord[]) => void;

  // Records overlay
  recordsOverlay: RecordsOverlayState;
  openRecordsOverlay: (context?: RecordsOverlayState['context']) => void;
  closeRecordsOverlay: () => void;
  setRecordFilters: (filters: Partial<RecordFilters>) => void;
  toggleRecordSelection: (id: string) => void;
  selectAllRecords: () => void;
  clearRecordSelection: () => void;

  // Modal state
  activeModal: ActiveModal;
  openModal: (modal: ActiveModal) => void;
  closeModal: () => void;

  // Pipeline actions
  selectedNode: PipelineNode | null;
  selectNode: (nodeId: number | null) => void;

  // Refresh
  refreshDataset: () => Promise<void>;
  refreshRecords: () => Promise<void>;
}

// ============================================================
// DEFAULT VALUES
// ============================================================

const defaultRecordsOverlay: RecordsOverlayState = {
  isOpen: false,
  context: null,
  filters: {
    search: '',
    topic: null,
    valid: null,
    source: 'all',
  },
  selectedIds: [],
};

// ============================================================
// CONTEXT CREATION
// ============================================================

const OptimizationContext = createContext<OptimizationContextValue | null>(null);

// ============================================================
// PROVIDER COMPONENT
// ============================================================

interface OptimizationProviderProps {
  children: ReactNode;
  datasetId?: string;
}

export const OptimizationProvider: FC<OptimizationProviderProps> = ({
  children,
  datasetId
}) => {
  // Dataset state
  const [dataset, setDataset] = useState<OptimizationDataset | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Records state
  const [records, setRecords] = useState<DatasetRecord[]>([]);

  // Overlay state
  const [recordsOverlay, setRecordsOverlay] = useState<RecordsOverlayState>(defaultRecordsOverlay);

  // Modal state
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);

  // Selected node
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);

  // Computed selected node
  const selectedNode = dataset?.pipeline.nodes.find(n => n.id === selectedNodeId) ?? null;

  // ============================================================
  // RECORDS OVERLAY ACTIONS
  // ============================================================

  const openRecordsOverlay = useCallback((context?: RecordsOverlayState['context']) => {
    setRecordsOverlay(prev => ({
      ...prev,
      isOpen: true,
      context: context ?? null,
      filters: context?.presetFilter
        ? { ...prev.filters, ...context.presetFilter }
        : prev.filters,
    }));
  }, []);

  const closeRecordsOverlay = useCallback(() => {
    setRecordsOverlay(prev => ({
      ...prev,
      isOpen: false,
      context: null,
    }));
  }, []);

  const setRecordFilters = useCallback((filters: Partial<RecordFilters>) => {
    setRecordsOverlay(prev => ({
      ...prev,
      filters: { ...prev.filters, ...filters },
    }));
  }, []);

  const toggleRecordSelection = useCallback((id: string) => {
    setRecordsOverlay(prev => ({
      ...prev,
      selectedIds: prev.selectedIds.includes(id)
        ? prev.selectedIds.filter(i => i !== id)
        : [...prev.selectedIds, id],
    }));
  }, []);

  const selectAllRecords = useCallback(() => {
    // TODO: Apply filters and select all matching
    setRecordsOverlay(prev => ({
      ...prev,
      selectedIds: records.map(r => r.id),
    }));
  }, [records]);

  const clearRecordSelection = useCallback(() => {
    setRecordsOverlay(prev => ({
      ...prev,
      selectedIds: [],
    }));
  }, []);

  // ============================================================
  // MODAL ACTIONS
  // ============================================================

  const openModal = useCallback((modal: ActiveModal) => {
    setActiveModal(modal);
  }, []);

  const closeModal = useCallback(() => {
    setActiveModal(null);
  }, []);

  // ============================================================
  // NODE SELECTION
  // ============================================================

  const selectNode = useCallback((nodeId: number | null) => {
    setSelectedNodeId(nodeId);
  }, []);

  // ============================================================
  // DATA FETCHING
  // ============================================================

  const refreshDataset = useCallback(async () => {
    if (!datasetId) return;
    setIsLoading(true);
    try {
      // TODO: Implement API call
      // const data = await optimizationApi.getDataset(datasetId);
      // setDataset(data);
    } finally {
      setIsLoading(false);
    }
  }, [datasetId]);

  const refreshRecords = useCallback(async () => {
    if (!datasetId) return;
    try {
      // TODO: Implement API call
      // const data = await optimizationApi.getRecords(datasetId);
      // setRecords(data);
    } catch (error) {
      console.error('Failed to refresh records:', error);
    }
  }, [datasetId]);

  // ============================================================
  // CONTEXT VALUE
  // ============================================================

  const value: OptimizationContextValue = {
    dataset,
    setDataset,
    isLoading,
    records,
    setRecords,
    recordsOverlay,
    openRecordsOverlay,
    closeRecordsOverlay,
    setRecordFilters,
    toggleRecordSelection,
    selectAllRecords,
    clearRecordSelection,
    activeModal,
    openModal,
    closeModal,
    selectedNode,
    selectNode,
    refreshDataset,
    refreshRecords,
  };

  return (
    <OptimizationContext.Provider value={value}>
      {children}
    </OptimizationContext.Provider>
  );
};

// ============================================================
// HOOK
// ============================================================

export const useOptimization = () => {
  const context = useContext(OptimizationContext);
  if (!context) {
    throw new Error('useOptimization must be used within OptimizationProvider');
  }
  return context;
};
```

### 1.3 Route Configuration

**File:** `src/App.tsx` (add routes)

```tsx
// Add these routes to the router configuration

import { DatasetsListPage } from '@/pages/optimization';
import { CreateDatasetPage } from '@/pages/optimization/new';
import { DatasetCanvasPage } from '@/pages/optimization/[id]';
import { DatasetSettingsPage } from '@/pages/optimization/[id]/settings';

// In route config:
{
  path: 'optimization',
  children: [
    { index: true, element: <DatasetsListPage /> },
    { path: 'new', element: <CreateDatasetPage /> },
    {
      path: ':datasetId',
      children: [
        { index: true, element: <DatasetCanvasPage /> },
        { path: 'settings', element: <DatasetSettingsPage /> },
      ]
    },
  ]
}
```

---

## Phase 2: Datasets List Page

### 2.1 Page Component

**File:** `src/pages/optimization/index.tsx`

```tsx
import { FC, useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DatasetCard } from '@/components/optimization/DatasetCard';
import { EmptyState } from '@/components/optimization/EmptyState';
import { OptimizationDataset } from '@/types/optimization-types';

type StatusFilter = 'all' | 'in_progress' | 'attention' | 'training' | 'complete';
type SortOption = 'updated' | 'name' | 'records';

export const DatasetsListPage: FC = () => {
  const navigate = useNavigate();

  // State
  const [datasets, setDatasets] = useState<OptimizationDataset[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('updated');

  // Fetch datasets
  useEffect(() => {
    const fetchDatasets = async () => {
      setIsLoading(true);
      try {
        // TODO: API call
        // const data = await optimizationApi.listDatasets();
        // setDatasets(data);
      } finally {
        setIsLoading(false);
      }
    };
    fetchDatasets();
  }, []);

  // Filter and sort
  const filteredDatasets = useMemo(() => {
    let result = [...datasets];

    // Search filter
    if (search) {
      const searchLower = search.toLowerCase();
      result = result.filter(d =>
        d.name.toLowerCase().includes(searchLower)
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter(d => {
        // TODO: Implement status mapping based on pipeline state
        return true;
      });
    }

    // Sort
    result.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'records':
          return b.stats.totalRecords - a.stats.totalRecords;
        case 'updated':
        default:
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }
    });

    return result;
  }, [datasets, search, statusFilter, sortBy]);

  // Handlers
  const handleCreateNew = () => {
    navigate('/optimization/new');
  };

  const handleOpenDataset = (id: string) => {
    navigate(`/optimization/${id}`);
  };

  const handleDuplicate = async (id: string) => {
    // TODO: API call to duplicate
  };

  const handleExport = async (id: string) => {
    // TODO: API call to export
  };

  const handleDelete = async (id: string) => {
    // TODO: API call to delete with confirmation
  };

  // Empty state
  if (!isLoading && datasets.length === 0) {
    return (
      <div className="container mx-auto py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold">Your Datasets</h1>
          <Button onClick={handleCreateNew}>
            <Plus className="w-4 h-4 mr-2" />
            New Dataset
          </Button>
        </div>
        <EmptyState onCreateClick={handleCreateNew} />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Your Datasets</h1>
        <Button onClick={handleCreateNew}>
          <Plus className="w-4 h-4 mr-2" />
          New Dataset
        </Button>
      </div>

      {/* Toolbar */}
      <div className="flex gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search datasets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="attention">Needs Attention</SelectItem>
            <SelectItem value="training">Training</SelectItem>
            <SelectItem value="complete">Complete</SelectItem>
          </SelectContent>
        </Select>

        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="updated">Last Updated</SelectItem>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="records">Records Count</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Dataset Cards */}
      <div className="space-y-4">
        {filteredDatasets.map((dataset) => (
          <DatasetCard
            key={dataset.id}
            dataset={dataset}
            onOpen={() => handleOpenDataset(dataset.id)}
            onDuplicate={() => handleDuplicate(dataset.id)}
            onExport={() => handleExport(dataset.id)}
            onDelete={() => handleDelete(dataset.id)}
          />
        ))}
      </div>
    </div>
  );
};
```

### 2.2 Dataset Card Component

**File:** `src/components/optimization/DatasetCard.tsx`

```tsx
import { FC } from 'react';
import { MoreVertical, Copy, Download, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MiniPipelineProgress } from './MiniPipelineProgress';
import { OptimizationDataset } from '@/types/optimization-types';
import { formatDistanceToNow } from 'date-fns';

interface DatasetCardProps {
  dataset: OptimizationDataset;
  onOpen: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onDelete: () => void;
}

export const DatasetCard: FC<DatasetCardProps> = ({
  dataset,
  onOpen,
  onDuplicate,
  onExport,
  onDelete,
}) => {
  const { name, stats, pipeline, updatedAt } = dataset;

  // Compute current status text
  const getStatusText = () => {
    const currentNode = pipeline.nodes[pipeline.currentStep - 1];
    if (!currentNode) return 'Unknown';

    switch (currentNode.status) {
      case 'processing':
        return `Step ${currentNode.id}: ${currentNode.name} in progress`;
      case 'attention':
        return `⚠️ Step ${currentNode.id}: ${currentNode.name} needs attention`;
      case 'failed':
        return `❌ Step ${currentNode.id}: ${currentNode.name} failed`;
      case 'complete':
        if (currentNode.id === 7) {
          return `✅ Deployed • +${Math.round((stats.dryRunMean || 0) * 100)}% improvement`;
        }
        return 'Ready to continue';
      default:
        return currentNode.statusLabel;
    }
  };

  return (
    <Card
      className="cursor-pointer hover:border-primary/50 transition-colors"
      onClick={onOpen}
    >
      <CardContent className="p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-semibold">{name}</h3>
            <p className="text-sm text-muted-foreground">
              {stats.totalRecords.toLocaleString()} records • {stats.topicsCount} topics
              {stats.balanceScore !== null && ` • Balance: ${stats.balanceScore.toFixed(2)}`}
            </p>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="icon">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDuplicate(); }}>
                <Copy className="w-4 h-4 mr-2" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onExport(); }}>
                <Download className="w-4 h-4 mr-2" />
                Export
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive"
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Mini Pipeline Progress */}
        <div className="mb-3">
          <MiniPipelineProgress nodes={pipeline.nodes} />
        </div>

        {/* Status Text */}
        <p className="text-sm text-muted-foreground mb-2">
          {getStatusText()}
        </p>

        {/* Updated Time */}
        <p className="text-xs text-muted-foreground">
          Updated: {formatDistanceToNow(new Date(updatedAt), { addSuffix: true })}
        </p>
      </CardContent>
    </Card>
  );
};
```

### 2.3 Mini Pipeline Progress

**File:** `src/components/optimization/MiniPipelineProgress.tsx`

```tsx
import { FC } from 'react';
import { cn } from '@/lib/utils';
import { PipelineNode, NodeStatus } from '@/types/optimization-types';
import { Check, AlertCircle, Loader2, Circle } from 'lucide-react';

interface MiniPipelineProgressProps {
  nodes: PipelineNode[];
}

const getStatusIcon = (status: NodeStatus) => {
  switch (status) {
    case 'complete':
    case 'configured':
    case 'passed':
      return <Check className="w-3 h-3" />;
    case 'processing':
      return <Loader2 className="w-3 h-3 animate-spin" />;
    case 'attention':
    case 'failed':
      return <AlertCircle className="w-3 h-3" />;
    default:
      return <Circle className="w-3 h-3" />;
  }
};

const getStatusColor = (status: NodeStatus) => {
  switch (status) {
    case 'complete':
    case 'configured':
    case 'passed':
      return 'bg-green-500 text-white';
    case 'processing':
    case 'active':
      return 'bg-blue-500 text-white';
    case 'attention':
      return 'bg-yellow-500 text-white';
    case 'failed':
      return 'bg-red-500 text-white';
    default:
      return 'bg-muted text-muted-foreground';
  }
};

export const MiniPipelineProgress: FC<MiniPipelineProgressProps> = ({ nodes }) => {
  return (
    <div className="flex items-center gap-1">
      {nodes.map((node, index) => (
        <div key={node.id} className="flex items-center">
          {/* Node indicator */}
          <div
            className={cn(
              'w-6 h-6 rounded-full flex items-center justify-center',
              getStatusColor(node.status)
            )}
          >
            {getStatusIcon(node.status)}
          </div>

          {/* Connector line */}
          {index < nodes.length - 1 && (
            <div className={cn(
              'w-4 h-0.5',
              node.status === 'complete' || node.status === 'configured' || node.status === 'passed'
                ? 'bg-green-500'
                : 'bg-muted'
            )} />
          )}
        </div>
      ))}
    </div>
  );
};
```

### 2.4 Empty State

**File:** `src/components/optimization/EmptyState.tsx`

```tsx
import { FC } from 'react';
import { Rocket } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  onCreateClick: () => void;
}

export const EmptyState: FC<EmptyStateProps> = ({ onCreateClick }) => {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-6">
        <Rocket className="w-8 h-8 text-primary" />
      </div>

      <h2 className="text-xl font-semibold mb-2">No datasets yet</h2>

      <p className="text-muted-foreground max-w-md mb-6">
        Create your first dataset from gateway traces to start training custom models.
      </p>

      <Button onClick={onCreateClick}>
        Create Dataset
      </Button>
    </div>
  );
};
```

---

## Phase 3: Create Dataset Page

### 3.1 Page Component

**File:** `src/pages/optimization/new.tsx`

```tsx
import { FC, useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TraceSelector } from '@/components/optimization/create/TraceSelector';
import { FileUploader } from '@/components/optimization/create/FileUploader';
import { DetectedPattern } from '@/components/optimization/create/DetectedPattern';
import { DatasetConfigForm } from '@/components/optimization/create/DatasetConfigForm';

interface SelectedTrace {
  id: string;
  systemPrompt: string;
  model: string;
  turns: number;
  timestamp: string;
}

interface DetectedPatternInfo {
  title: string;
  systemPrompt: string;
  capabilities: string[];
  toolCount: number;
}

interface UploadResult {
  filename: string;
  totalRecords: number;
  validRecords: number;
  invalidRecords: number;
  preview: Array<{ role: string; content: string }[]>;
}

export const CreateDatasetPage: FC = () => {
  const navigate = useNavigate();

  // Tab state
  const [activeTab, setActiveTab] = useState<'gateway' | 'upload'>('gateway');

  // Trace selection state
  const [selectedTraces, setSelectedTraces] = useState<SelectedTrace[]>([]);
  const [detectedPattern, setDetectedPattern] = useState<DetectedPatternInfo | null>(null);

  // Upload state
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);

  // Form state
  const [datasetName, setDatasetName] = useState('');
  const [objective, setObjective] = useState('');

  // Loading states
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Analyze selected traces for pattern detection
  useEffect(() => {
    if (selectedTraces.length === 0) {
      setDetectedPattern(null);
      return;
    }

    const analyzeTraces = async () => {
      setIsAnalyzing(true);
      try {
        // TODO: API call to analyze traces
        // const pattern = await optimizationApi.analyzeTraces(selectedTraces.map(t => t.id));
        // setDetectedPattern(pattern);
        // setDatasetName(pattern.suggestedName);
        // setObjective(pattern.suggestedObjective);
      } finally {
        setIsAnalyzing(false);
      }
    };

    // Debounce
    const timeout = setTimeout(analyzeTraces, 500);
    return () => clearTimeout(timeout);
  }, [selectedTraces]);

  // Handle file upload
  const handleFileUpload = useCallback(async (file: File) => {
    try {
      // TODO: Parse and validate JSONL file
      // const result = await parseJsonlFile(file);
      // setUploadResult(result);
    } catch (error) {
      console.error('File upload failed:', error);
    }
  }, []);

  // Handle create
  const handleCreate = async () => {
    if (!datasetName || !objective) return;

    setIsCreating(true);
    try {
      let datasetId: string;

      if (activeTab === 'gateway') {
        // Create from traces
        // datasetId = await optimizationApi.createFromTraces({
        //   name: datasetName,
        //   objective,
        //   traceIds: selectedTraces.map(t => t.id),
        // });
      } else {
        // Create from upload
        // datasetId = await optimizationApi.createFromUpload({
        //   name: datasetName,
        //   objective,
        //   file: uploadResult?.filename,
        // });
      }

      // Navigate to canvas
      // navigate(`/optimization/${datasetId}`);
    } finally {
      setIsCreating(false);
    }
  };

  // Check if form is valid
  const canCreate =
    datasetName.trim() !== '' &&
    objective.trim() !== '' &&
    ((activeTab === 'gateway' && selectedTraces.length > 0) ||
     (activeTab === 'upload' && uploadResult !== null));

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b px-6 py-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/optimization')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <div className="text-sm text-muted-foreground">Model Optimization</div>
            <h1 className="text-xl font-semibold">New Dataset</h1>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="container mx-auto py-8">
        <div className="grid grid-cols-2 gap-8">
          {/* Left Panel - Data Source */}
          <div className="space-y-6">
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'gateway' | 'upload')}>
              <TabsList className="w-full">
                <TabsTrigger value="gateway" className="flex-1">
                  From Gateway Traces
                </TabsTrigger>
                <TabsTrigger value="upload" className="flex-1">
                  Upload File
                </TabsTrigger>
              </TabsList>

              <TabsContent value="gateway" className="mt-6">
                <TraceSelector
                  selectedTraces={selectedTraces}
                  onSelectionChange={setSelectedTraces}
                />
              </TabsContent>

              <TabsContent value="upload" className="mt-6">
                <FileUploader
                  uploadResult={uploadResult}
                  onUpload={handleFileUpload}
                  onRemove={() => setUploadResult(null)}
                />
              </TabsContent>
            </Tabs>
          </div>

          {/* Right Panel - Configure */}
          <div className="space-y-6">
            {/* Detected Pattern */}
            <DetectedPattern
              pattern={detectedPattern}
              uploadResult={uploadResult}
              isAnalyzing={isAnalyzing}
              activeTab={activeTab}
            />

            <div className="border-t pt-6">
              {/* Config Form */}
              <DatasetConfigForm
                name={datasetName}
                objective={objective}
                onNameChange={setDatasetName}
                onObjectiveChange={setObjective}
              />

              {/* Create Button */}
              <Button
                className="w-full mt-6"
                size="lg"
                disabled={!canCreate || isCreating}
                onClick={handleCreate}
              >
                {isCreating ? 'Creating...' : 'Create Dataset & Start →'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
```

### 3.2 Trace Selector Component

**File:** `src/components/optimization/create/TraceSelector.tsx`

```tsx
import { FC, useState, useEffect, useMemo } from 'react';
import { Search, RefreshCw } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { formatDistanceToNow } from 'date-fns';

interface Trace {
  id: string;
  systemPrompt: string;
  model: string;
  turns: number;
  timestamp: string;
}

interface TraceSelectorProps {
  selectedTraces: Trace[];
  onSelectionChange: (traces: Trace[]) => void;
}

export const TraceSelector: FC<TraceSelectorProps> = ({
  selectedTraces,
  onSelectionChange,
}) => {
  // State
  const [traces, setTraces] = useState<Trace[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [timeRange, setTimeRange] = useState('7d');
  const [model, setModel] = useState('all');
  const [minTurns, setMinTurns] = useState('1');
  const [hasResponse, setHasResponse] = useState(true);
  const [search, setSearch] = useState('');

  // Fetch traces
  useEffect(() => {
    const fetchTraces = async () => {
      setIsLoading(true);
      try {
        // TODO: API call with filters
        // const data = await tracesApi.list({ timeRange, model, minTurns, hasResponse });
        // setTraces(data);
      } finally {
        setIsLoading(false);
      }
    };
    fetchTraces();
  }, [timeRange, model, minTurns, hasResponse]);

  // Filter traces locally by search
  const filteredTraces = useMemo(() => {
    if (!search) return traces;
    const searchLower = search.toLowerCase();
    return traces.filter(t =>
      t.systemPrompt.toLowerCase().includes(searchLower)
    );
  }, [traces, search]);

  // Selection helpers
  const selectedIds = new Set(selectedTraces.map(t => t.id));
  const allSelected = filteredTraces.length > 0 && filteredTraces.every(t => selectedIds.has(t.id));

  const toggleTrace = (trace: Trace) => {
    if (selectedIds.has(trace.id)) {
      onSelectionChange(selectedTraces.filter(t => t.id !== trace.id));
    } else {
      onSelectionChange([...selectedTraces, trace]);
    }
  };

  const toggleAll = () => {
    if (allSelected) {
      onSelectionChange([]);
    } else {
      onSelectionChange(filteredTraces);
    }
  };

  // Get unique models for filter dropdown
  const availableModels = useMemo(() => {
    const models = new Set(traces.map(t => t.model));
    return Array.from(models);
  }, [traces]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
        <div className="grid grid-cols-2 gap-3">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger>
              <SelectValue placeholder="Time Range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Last 24 hours</SelectItem>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectContent>
          </Select>

          <Select value={model} onValueChange={setModel}>
            <SelectTrigger>
              <SelectValue placeholder="Model" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All models</SelectItem>
              {availableModels.map(m => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={minTurns} onValueChange={setMinTurns}>
            <SelectTrigger>
              <SelectValue placeholder="Min Turns" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1+ turns</SelectItem>
              <SelectItem value="2">2+ turns</SelectItem>
              <SelectItem value="3">3+ turns</SelectItem>
              <SelectItem value="5">5+ turns</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-2">
            <Checkbox
              id="has-response"
              checked={hasResponse}
              onCheckedChange={(v) => setHasResponse(!!v)}
            />
            <label htmlFor="has-response" className="text-sm">
              Has assistant response
            </label>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search traces..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Match Count */}
      <div className="flex justify-between items-center text-sm text-muted-foreground">
        <span>
          Matching: {filteredTraces.length.toLocaleString()} of {traces.length.toLocaleString()} total
        </span>
        <Button variant="ghost" size="sm" onClick={() => {}}>
          <RefreshCw className="w-4 h-4 mr-1" />
          Refresh
        </Button>
      </div>

      {/* Trace List */}
      <ScrollArea className="h-[400px] border rounded-lg">
        {/* Select All */}
        <div className="sticky top-0 bg-background border-b p-3 flex items-center gap-3">
          <Checkbox
            checked={allSelected}
            onCheckedChange={toggleAll}
          />
          <span className="text-sm font-medium">
            Select All ({filteredTraces.length.toLocaleString()})
          </span>
        </div>

        {/* Trace Items */}
        {filteredTraces.map(trace => (
          <div
            key={trace.id}
            className="border-b p-3 hover:bg-muted/50 cursor-pointer"
            onClick={() => toggleTrace(trace)}
          >
            <div className="flex items-start gap-3">
              <Checkbox
                checked={selectedIds.has(trace.id)}
                onCheckedChange={() => toggleTrace(trace)}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">
                  "{trace.systemPrompt.slice(0, 50)}..."
                </p>
                <p className="text-xs text-muted-foreground">
                  {trace.model} • {trace.turns} turns • {formatDistanceToNow(new Date(trace.timestamp), { addSuffix: true })}
                </p>
              </div>
            </div>
          </div>
        ))}

        {/* Empty State */}
        {filteredTraces.length === 0 && !isLoading && (
          <div className="p-8 text-center text-muted-foreground">
            <p>No traces match your filters</p>
            <Button variant="link" onClick={() => {
              setTimeRange('all');
              setModel('all');
              setMinTurns('1');
              setSearch('');
            }}>
              Clear all filters
            </Button>
          </div>
        )}
      </ScrollArea>

      {/* Selection Summary */}
      <div className="text-sm font-medium">
        Selected: {selectedTraces.length.toLocaleString()} traces
      </div>
    </div>
  );
};
```

### 3.3 File Uploader Component

**File:** `src/components/optimization/create/FileUploader.tsx`

```tsx
import { FC, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { FileText, Upload, X, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';

interface UploadResult {
  filename: string;
  totalRecords: number;
  validRecords: number;
  invalidRecords: number;
  preview: Array<{ role: string; content: string }[]>;
}

interface FileUploaderProps {
  uploadResult: UploadResult | null;
  onUpload: (file: File) => void;
  onRemove: () => void;
}

export const FileUploader: FC<FileUploaderProps> = ({
  uploadResult,
  onUpload,
  onRemove,
}) => {
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      onUpload(acceptedFiles[0]);
    }
  }, [onUpload]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/jsonl': ['.jsonl'],
      'application/json': ['.json'],
    },
    maxFiles: 1,
  });

  // Show upload result if file is uploaded
  if (uploadResult) {
    return (
      <div className="space-y-4">
        {/* File Info */}
        <Card className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded bg-green-500/10 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-500" />
              </div>
              <div>
                <p className="font-medium">{uploadResult.filename}</p>
                <p className="text-sm text-muted-foreground">
                  {uploadResult.totalRecords.toLocaleString()} records parsed
                </p>
                <p className="text-sm text-muted-foreground">
                  {uploadResult.validRecords.toLocaleString()} valid ({Math.round(uploadResult.validRecords / uploadResult.totalRecords * 100)}%)
                </p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onRemove}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </Card>

        {/* Preview */}
        <div>
          <h4 className="text-sm font-medium mb-2">Preview</h4>
          <ScrollArea className="h-[200px] border rounded-lg">
            {uploadResult.preview.map((messages, i) => (
              <div key={i} className="p-3 border-b text-sm">
                {messages.map((msg, j) => (
                  <div key={j} className="flex gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      [{msg.role.slice(0, 3).toUpperCase()}]
                    </span>
                    <span className="truncate">{msg.content}</span>
                  </div>
                ))}
              </div>
            ))}
          </ScrollArea>
        </div>

        {/* Validation Warning */}
        {uploadResult.invalidRecords > 0 && (
          <div className="flex items-center gap-2 text-yellow-600 text-sm">
            <AlertCircle className="w-4 h-4" />
            <span>
              {uploadResult.invalidRecords} records have validation errors. These will be excluded.
            </span>
            <Button variant="link" size="sm" className="h-auto p-0">
              View Errors
            </Button>
          </div>
        )}
      </div>
    );
  }

  // Show dropzone
  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={`
          border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
          transition-colors
          ${isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'}
        `}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-2">
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <Upload className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="font-medium">
            {isDragActive ? 'Drop your file here' : 'Drag & drop your file here'}
          </p>
          <p className="text-sm text-muted-foreground">
            or click to browse
          </p>
          <p className="text-xs text-muted-foreground">
            Supported: .jsonl
          </p>
        </div>
      </div>

      {/* Format Requirements */}
      <div className="text-sm text-muted-foreground">
        <h4 className="font-medium text-foreground mb-2">Format Requirements</h4>
        <ul className="space-y-1">
          <li>• Each line must be a JSON object with <code className="bg-muted px-1 rounded">messages[]</code> array</li>
          <li>• Optional: <code className="bg-muted px-1 rounded">tools[]</code>, <code className="bg-muted px-1 rounded">tool_choice</code></li>
        </ul>
        <Button variant="link" className="h-auto p-0 mt-2">
          View Format Guide
        </Button>
      </div>
    </div>
  );
};
```

### 3.4 Detected Pattern Component

**File:** `src/components/optimization/create/DetectedPattern.tsx`

```tsx
import { FC } from 'react';
import { Loader2, Sparkles, ChevronDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';

interface DetectedPatternInfo {
  title: string;
  systemPrompt: string;
  capabilities: string[];
  toolCount: number;
}

interface UploadResult {
  filename: string;
  totalRecords: number;
  validRecords: number;
  invalidRecords: number;
}

interface DetectedPatternProps {
  pattern: DetectedPatternInfo | null;
  uploadResult: UploadResult | null;
  isAnalyzing: boolean;
  activeTab: 'gateway' | 'upload';
}

export const DetectedPattern: FC<DetectedPatternProps> = ({
  pattern,
  uploadResult,
  isAnalyzing,
  activeTab,
}) => {
  // Loading state
  if (isAnalyzing) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            Detected Pattern
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  // Empty state
  if (!pattern && !uploadResult) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            Detected Pattern
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">
            {activeTab === 'gateway'
              ? 'Select traces from the left panel to see auto-detected patterns.'
              : 'Upload a file to see detected patterns.'}
          </p>
        </CardContent>
      </Card>
    );
  }

  // Show detected pattern
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Sparkles className="w-4 h-4" />
          Detected Pattern
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {pattern && (
          <>
            {/* Title */}
            <div>
              <h3 className="font-semibold text-lg">{pattern.title}</h3>
            </div>

            {/* System Prompt Preview */}
            <Collapsible>
              <div className="text-sm">
                <span className="text-muted-foreground">System prompt: </span>
                <span className="line-clamp-2">{pattern.systemPrompt}</span>
              </div>
              <CollapsibleTrigger className="text-sm text-primary flex items-center gap-1 mt-1">
                <ChevronDown className="w-3 h-3" />
                Expand
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-2">
                <pre className="text-xs bg-muted p-3 rounded-lg overflow-auto max-h-[200px]">
                  {pattern.systemPrompt}
                </pre>
              </CollapsibleContent>
            </Collapsible>

            {/* Detected Capabilities */}
            <div>
              <span className="text-sm text-muted-foreground">Detected:</span>
              <div className="flex flex-wrap gap-2 mt-2">
                {pattern.capabilities.map((cap, i) => (
                  <Badge key={i} variant="secondary">{cap}</Badge>
                ))}
                {pattern.toolCount > 0 && (
                  <Badge variant="outline">{pattern.toolCount} tools</Badge>
                )}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
```

### 3.5 Dataset Config Form

**File:** `src/components/optimization/create/DatasetConfigForm.tsx`

```tsx
import { FC } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

interface DatasetConfigFormProps {
  name: string;
  objective: string;
  onNameChange: (name: string) => void;
  onObjectiveChange: (objective: string) => void;
}

export const DatasetConfigForm: FC<DatasetConfigFormProps> = ({
  name,
  objective,
  onNameChange,
  onObjectiveChange,
}) => {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="dataset-name">Dataset Name *</Label>
        <Input
          id="dataset-name"
          placeholder="e.g., chess-tutor"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="objective">Training Objective *</Label>
        <Textarea
          id="objective"
          placeholder="Describe what you want the model to improve at..."
          value={objective}
          onChange={(e) => onObjectiveChange(e.target.value)}
          rows={4}
        />
        <p className="text-xs text-muted-foreground">
          This helps us configure the optimal grader for RFT
        </p>
      </div>
    </div>
  );
};
```

---

## Phase 4: Dataset Canvas View

### 4.1 Canvas Page

**File:** `src/pages/optimization/[id]/index.tsx`

```tsx
import { FC, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { OptimizationProvider, useOptimization } from '@/contexts/OptimizationContext';
import { CanvasHeader } from '@/components/optimization/canvas/CanvasHeader';
import { HealthIndicator } from '@/components/optimization/canvas/HealthIndicator';
import { PipelineCanvas } from '@/components/optimization/canvas/PipelineCanvas';
import { RecordsOverlay } from '@/components/optimization/records/RecordsOverlay';
import { StepModals } from '@/components/optimization/modals/StepModals';

const DatasetCanvasContent: FC = () => {
  const { dataset, isLoading, refreshDataset, refreshRecords } = useOptimization();

  // Initial data fetch
  useEffect(() => {
    refreshDataset();
    refreshRecords();
  }, [refreshDataset, refreshRecords]);

  if (isLoading || !dataset) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col">
      {/* Header */}
      <CanvasHeader />

      {/* Health Indicator */}
      <HealthIndicator />

      {/* Canvas */}
      <div className="flex-1 relative">
        <PipelineCanvas />
      </div>

      {/* Records Overlay */}
      <RecordsOverlay />

      {/* Step Modals */}
      <StepModals />
    </div>
  );
};

export const DatasetCanvasPage: FC = () => {
  const { datasetId } = useParams<{ datasetId: string }>();

  return (
    <OptimizationProvider datasetId={datasetId}>
      <DatasetCanvasContent />
    </OptimizationProvider>
  );
};
```

### 4.2 Canvas Header

**File:** `src/components/optimization/canvas/CanvasHeader.tsx`

```tsx
import { FC } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Settings,
  LayoutGrid,
  Download,
  Upload,
  FileText,
  FolderTree,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useOptimization } from '@/contexts/OptimizationContext';

export const CanvasHeader: FC = () => {
  const navigate = useNavigate();
  const { dataset, openRecordsOverlay, openModal } = useOptimization();

  if (!dataset) return null;

  return (
    <header className="border-b border-[#1a3a2a] px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/optimization')}
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>

        <div>
          <div className="flex items-center gap-2">
            <span className="text-[#10b981]">✦</span>
            <span className="font-semibold">RFT Pipeline</span>
            <span className="text-muted-foreground">•</span>
            <span>{dataset.name}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            ● SPATIAL MODE • V3.6
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {/* Records Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => openRecordsOverlay()}
        >
          <LayoutGrid className="w-4 h-4 mr-2" />
          Records
        </Button>

        {/* Data Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <FileText className="w-4 h-4 mr-2" />
              Data
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openModal('import-records')}>
              <Upload className="w-4 h-4 mr-2" />
              Import Records...
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => {}}>
              <Download className="w-4 h-4 mr-2" />
              Download Records
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => openModal('import-topics')}>
              <FolderTree className="w-4 h-4 mr-2" />
              Import Topics...
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => {}}>
              <Download className="w-4 h-4 mr-2" />
              Download Topics
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Settings */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(`/optimization/${dataset.id}/settings`)}
        >
          <Settings className="w-4 h-4" />
        </Button>
      </div>
    </header>
  );
};
```

### 4.3 Health Indicator

**File:** `src/components/optimization/canvas/HealthIndicator.tsx`

```tsx
import { FC } from 'react';
import { Check, AlertTriangle, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOptimization } from '@/contexts/OptimizationContext';
import { cn } from '@/lib/utils';

export const HealthIndicator: FC = () => {
  const { dataset, openRecordsOverlay } = useOptimization();

  if (!dataset) return null;

  const { validRecords, invalidRecords, totalRecords } = dataset.stats;
  const invalidRate = totalRecords > 0 ? invalidRecords / totalRecords : 0;

  // Determine status
  const getStatus = () => {
    if (invalidRecords === 0) return 'healthy';
    if (invalidRate > 0.2) return 'warning';
    return 'attention';
  };

  const status = getStatus();

  const statusConfig = {
    healthy: {
      icon: Check,
      bgColor: 'bg-green-500/10',
      borderColor: 'border-green-500/30',
      textColor: 'text-green-500',
    },
    attention: {
      icon: AlertTriangle,
      bgColor: 'bg-yellow-500/10',
      borderColor: 'border-yellow-500/30',
      textColor: 'text-yellow-500',
    },
    warning: {
      icon: X,
      bgColor: 'bg-red-500/10',
      borderColor: 'border-red-500/30',
      textColor: 'text-red-500',
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <div className={cn(
      'px-4 py-2 border-b flex items-center justify-between',
      config.bgColor,
      config.borderColor
    )}>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Icon className={cn('w-4 h-4', config.textColor)} />
          <span className="text-sm">
            {validRecords.toLocaleString()} valid records
          </span>
        </div>

        {invalidRecords > 0 && (
          <div className="flex items-center gap-2 text-yellow-500">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm">
              {invalidRecords} invalid ({Math.round(invalidRate * 100)}%)
            </span>
          </div>
        )}
      </div>

      {invalidRecords > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => openRecordsOverlay({
            sourceStep: 0,
            label: 'Invalid records',
            presetFilter: { valid: false },
          })}
        >
          View Issues
        </Button>
      )}
    </div>
  );
};
```

### 4.4 Pipeline Canvas

**File:** `src/components/optimization/canvas/PipelineCanvas.tsx`

```tsx
import { FC, useCallback } from 'react';
import ReactFlow, {
  Background,
  Controls,
  Node,
  Edge,
  NodeTypes,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { PipelineNode } from './PipelineNode';
import { useOptimization } from '@/contexts/OptimizationContext';

// Custom node types
const nodeTypes: NodeTypes = {
  pipelineNode: PipelineNode,
};

// Node positions (fixed vertical layout)
const NODE_WIDTH = 280;
const NODE_HEIGHT = 120;
const NODE_GAP = 40;
const START_X = 100;
const START_Y = 50;

export const PipelineCanvas: FC = () => {
  const { dataset, selectNode, openModal } = useOptimization();

  if (!dataset) return null;

  // Convert pipeline nodes to React Flow nodes
  const initialNodes: Node[] = dataset.pipeline.nodes.map((node, index) => ({
    id: String(node.id),
    type: 'pipelineNode',
    position: { x: START_X, y: START_Y + index * (NODE_HEIGHT + NODE_GAP) },
    data: {
      ...node,
      onClick: () => handleNodeClick(node.id),
    },
    draggable: false,
  }));

  // Create edges between consecutive nodes
  const initialEdges: Edge[] = dataset.pipeline.nodes.slice(0, -1).map((node, index) => ({
    id: `e${node.id}-${node.id + 1}`,
    source: String(node.id),
    target: String(node.id + 1),
    type: 'smoothstep',
    style: {
      stroke: node.status === 'complete' ? '#10b981' : '#1a3a2a',
      strokeWidth: 2,
    },
    animated: node.status === 'processing',
  }));

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Handle node click
  const handleNodeClick = useCallback((nodeId: number) => {
    selectNode(nodeId);

    // Open corresponding modal
    const modalMap: Record<number, string> = {
      1: 'records',
      2: 'topics',
      3: 'coverage',
      4: 'grader',
      5: 'dry-run',
      6: 'training',
      7: 'deploy',
    };

    const modal = modalMap[nodeId];
    if (modal) {
      openModal(modal as any);
    }
  }, [selectNode, openModal]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      fitView
      minZoom={0.5}
      maxZoom={1.5}
      defaultViewport={{ x: 0, y: 0, zoom: 1 }}
      proOptions={{ hideAttribution: true }}
    >
      <Background color="#1a3a2a" gap={20} />
      <Controls
        showInteractive={false}
        className="!bg-[#0d1f17] !border-[#1a3a2a]"
      />
    </ReactFlow>
  );
};
```

### 4.5 Pipeline Node Component

**File:** `src/components/optimization/canvas/PipelineNode.tsx`

```tsx
import { FC, memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { cn } from '@/lib/utils';
import { PipelineNode as PipelineNodeType, NodeStatus } from '@/types/optimization-types';

interface PipelineNodeData extends PipelineNodeType {
  onClick: () => void;
}

const getStatusColor = (status: NodeStatus): string => {
  switch (status) {
    case 'complete':
    case 'configured':
    case 'passed':
      return 'bg-green-500';
    case 'processing':
    case 'active':
      return 'bg-blue-500';
    case 'attention':
      return 'bg-yellow-500';
    case 'failed':
      return 'bg-red-500';
    default:
      return 'bg-gray-500';
  }
};

const getStatusTextColor = (status: NodeStatus): string => {
  switch (status) {
    case 'complete':
    case 'configured':
    case 'passed':
      return 'text-green-500';
    case 'processing':
    case 'active':
      return 'text-blue-500';
    case 'attention':
      return 'text-yellow-500';
    case 'failed':
      return 'text-red-500';
    default:
      return 'text-gray-500';
  }
};

export const PipelineNode: FC<NodeProps<PipelineNodeData>> = memo(({ data }) => {
  const { id, name, category, status, summary, statusLabel, onClick } = data;

  const isDisabled = status === 'waiting';

  return (
    <div
      className={cn(
        'w-[280px] h-[120px] rounded-lg border p-4 cursor-pointer transition-all',
        'bg-[#0d1f17] border-[#1a3a2a]',
        !isDisabled && 'hover:border-[#10b981] hover:shadow-[0_0_12px_rgba(16,185,129,0.3)]',
        isDisabled && 'opacity-50 cursor-not-allowed'
      )}
      onClick={!isDisabled ? onClick : undefined}
    >
      {/* Input Handle */}
      {id > 1 && (
        <Handle
          type="target"
          position={Position.Top}
          className="!bg-[#10b981] !w-2 !h-2 !border-0"
        />
      )}

      {/* Content */}
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-2 mb-1">
          <div className="w-7 h-7 rounded-full bg-[#10b981] flex items-center justify-center text-[#0d1f17] font-bold text-sm">
            {id}
          </div>
          <span className="font-semibold">{name}</span>
        </div>

        {/* Category */}
        <span className="text-xs text-muted-foreground uppercase tracking-wider mb-auto">
          {category}
        </span>

        {/* Summary */}
        <div className="flex items-center justify-between mt-2">
          <span className="text-sm text-muted-foreground truncate flex-1">
            {summary}
          </span>

          {/* Status Badge */}
          <div className="flex items-center gap-1.5">
            <span className={cn('text-xs', getStatusTextColor(status))}>
              {statusLabel}
            </span>
            <div className={cn(
              'w-2 h-2 rounded-full',
              getStatusColor(status),
              status === 'processing' && 'animate-pulse'
            )} />
          </div>
        </div>
      </div>

      {/* Output Handle */}
      {id < 7 && (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!bg-[#10b981] !w-2 !h-2 !border-0"
        />
      )}
    </div>
  );
});

PipelineNode.displayName = 'PipelineNode';
```

---

## Phase 5: Step Modals

### 5.1 Modal Router

**File:** `src/components/optimization/modals/StepModals.tsx`

```tsx
import { FC } from 'react';
import { useOptimization } from '@/contexts/OptimizationContext';
import { RecordsViewerModal } from './RecordsViewerModal';
import { TopicsEditorModal } from './TopicsEditorModal';
import { CoverageDashboardModal } from './CoverageDashboardModal';
import { GenerateVariationsModal } from './GenerateVariationsModal';
import { ConfigureGraderModal } from './ConfigureGraderModal';
import { DryRunResultsModal } from './DryRunResultsModal';
import { StartTrainingModal } from './StartTrainingModal';
import { DeployModal } from './DeployModal';
import { ImportRecordsModal } from './ImportRecordsModal';
import { ImportTopicsModal } from './ImportTopicsModal';

export const StepModals: FC = () => {
  const { activeModal, closeModal } = useOptimization();

  return (
    <>
      <RecordsViewerModal
        open={activeModal === 'records'}
        onClose={closeModal}
      />
      <TopicsEditorModal
        open={activeModal === 'topics'}
        onClose={closeModal}
      />
      <CoverageDashboardModal
        open={activeModal === 'coverage'}
        onClose={closeModal}
      />
      <GenerateVariationsModal
        open={activeModal === 'generate'}
        onClose={closeModal}
      />
      <ConfigureGraderModal
        open={activeModal === 'grader'}
        onClose={closeModal}
      />
      <DryRunResultsModal
        open={activeModal === 'dry-run'}
        onClose={closeModal}
      />
      <StartTrainingModal
        open={activeModal === 'training'}
        onClose={closeModal}
      />
      <DeployModal
        open={activeModal === 'deploy'}
        onClose={closeModal}
      />
      <ImportRecordsModal
        open={activeModal === 'import-records'}
        onClose={closeModal}
      />
      <ImportTopicsModal
        open={activeModal === 'import-topics'}
        onClose={closeModal}
      />
    </>
  );
};
```

### 5.2 Coverage Dashboard Modal (Example)

**File:** `src/components/optimization/modals/CoverageDashboardModal.tsx`

```tsx
import { FC, useState, useEffect } from 'react';
import { Sparkles, AlertTriangle, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useOptimization } from '@/contexts/OptimizationContext';
import { CoverageReport, TopicDistribution } from '@/types/optimization-types';

interface CoverageDashboardModalProps {
  open: boolean;
  onClose: () => void;
}

export const CoverageDashboardModal: FC<CoverageDashboardModalProps> = ({
  open,
  onClose,
}) => {
  const { dataset, openModal } = useOptimization();
  const [coverage, setCoverage] = useState<CoverageReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch coverage data
  useEffect(() => {
    if (open && dataset) {
      const fetchCoverage = async () => {
        setIsLoading(true);
        try {
          // TODO: API call
          // const data = await optimizationApi.getCoverage(dataset.id);
          // setCoverage(data);
        } finally {
          setIsLoading(false);
        }
      };
      fetchCoverage();
    }
  }, [open, dataset]);

  const getBalanceStatus = (score: number) => {
    if (score >= 0.6) return { label: 'Good', color: 'text-green-500' };
    if (score >= 0.4) return { label: 'Fair', color: 'text-yellow-500' };
    return { label: 'Poor', color: 'text-red-500' };
  };

  const getTopicStatus = (dist: TopicDistribution) => {
    if (dist.status === 'under') return 'bg-red-500';
    if (dist.status === 'over') return 'bg-blue-500';
    return 'bg-green-500';
  };

  const handleGenerate = () => {
    openModal('generate');
  };

  if (!coverage && !isLoading) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Coverage Dashboard</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : coverage && (
          <div className="space-y-6">
            {/* Balance Score */}
            <div className="p-4 bg-muted rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-2xl font-bold">
                  {coverage.balanceScore.toFixed(2)}
                </span>
                <span className={getBalanceStatus(coverage.balanceScore).color}>
                  {getBalanceStatus(coverage.balanceScore).label}
                </span>
              </div>
              <Progress value={coverage.balanceScore * 100} className="h-2" />
              <p className="text-sm text-muted-foreground mt-2">
                Target: &gt; 0.6 for good training
              </p>
            </div>

            {/* Topic Distribution */}
            <div>
              <h3 className="font-semibold mb-4">Topic Distribution</h3>
              <div className="space-y-3">
                {Object.entries(coverage.distribution).map(([topic, dist]) => (
                  <div key={topic} className="flex items-center gap-4">
                    <span className="w-32 truncate text-sm">{topic}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Progress
                          value={dist.percentage}
                          className="flex-1 h-2"
                        />
                        <span className="text-sm w-12 text-right">
                          {dist.percentage.toFixed(0)}%
                        </span>
                        <span className="text-xs text-muted-foreground w-12">
                          ({dist.targetPercentage.toFixed(0)}%)
                        </span>
                        <div className={`w-2 h-2 rounded-full ${getTopicStatus(dist)}`} />
                      </div>
                    </div>
                    {dist.gap !== 0 && (
                      <span className={`text-xs ${dist.gap > 0 ? 'text-red-500' : 'text-blue-500'}`}>
                        {dist.gap > 0 ? `-${Math.abs(dist.gap)}` : `+${Math.abs(dist.gap)}`}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Recommendations */}
            {coverage.recommendations.length > 0 && (
              <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-yellow-500 mb-2">Recommendations</h4>
                    <ul className="space-y-1 text-sm">
                      {coverage.recommendations.map((rec, i) => (
                        <li key={i}>• {rec}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Skip for Now
          </Button>
          <Button onClick={handleGenerate}>
            <Sparkles className="w-4 h-4 mr-2" />
            Generate to Fill Gaps
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
```

---

## Phase 6: Records Overlay

### 6.1 Records Overlay Component

**File:** `src/components/optimization/records/RecordsOverlay.tsx`

```tsx
import { FC, useMemo } from 'react';
import { X, Filter, Trash2, Sparkles } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RecordFilters } from './RecordFilters';
import { RecordsTable } from './RecordsTable';
import { useOptimization } from '@/contexts/OptimizationContext';

export const RecordsOverlay: FC = () => {
  const {
    records,
    recordsOverlay,
    closeRecordsOverlay,
    setRecordFilters,
    clearRecordSelection,
    openModal,
  } = useOptimization();

  const { isOpen, context, filters, selectedIds } = recordsOverlay;

  // Filter records
  const filteredRecords = useMemo(() => {
    let result = [...records];

    // Search filter
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      result = result.filter(r => {
        const content = JSON.stringify(r.data.input.messages).toLowerCase();
        return content.includes(searchLower);
      });
    }

    // Topic filter
    if (filters.topic) {
      result = result.filter(r => r.topic === filters.topic);
    }

    // Valid filter
    if (filters.valid !== null) {
      result = result.filter(r => r.isValid === filters.valid);
    }

    // Source filter
    if (filters.source === 'traces') {
      result = result.filter(r => !r.isGenerated);
    } else if (filters.source === 'generated') {
      result = result.filter(r => r.isGenerated);
    }

    return result;
  }, [records, filters]);

  const hasSelection = selectedIds.length > 0;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && closeRecordsOverlay()}>
      <SheetContent side="right" className="w-[800px] sm:max-w-[800px] p-0">
        <SheetHeader className="p-4 border-b">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              Records
              {context?.label && (
                <Badge variant="secondary">{context.label}</Badge>
              )}
            </SheetTitle>
            <Button variant="ghost" size="icon" onClick={closeRecordsOverlay}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </SheetHeader>

        {/* Filters */}
        <div className="p-4 border-b">
          <RecordFilters
            filters={filters}
            onFiltersChange={setRecordFilters}
            recordCount={filteredRecords.length}
            totalCount={records.length}
          />
        </div>

        {/* Bulk Actions */}
        {hasSelection && (
          <div className="p-4 bg-muted/50 border-b flex items-center justify-between">
            <span className="text-sm">
              {selectedIds.length} selected
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={clearRecordSelection}>
                Clear Selection
              </Button>
              <Button variant="outline" size="sm">
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Selected
              </Button>
              <Button size="sm" onClick={() => openModal('generate')}>
                <Sparkles className="w-4 h-4 mr-2" />
                Generate from Selected
              </Button>
            </div>
          </div>
        )}

        {/* Records Table */}
        <div className="flex-1 overflow-auto">
          <RecordsTable records={filteredRecords} />
        </div>
      </SheetContent>
    </Sheet>
  );
};
```

---

## Phase 7: Settings Page

**File:** `src/pages/optimization/[id]/settings.tsx`

```tsx
import { FC, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useOptimization } from '@/contexts/OptimizationContext';

export const DatasetSettingsPage: FC = () => {
  const navigate = useNavigate();
  const { datasetId } = useParams<{ datasetId: string }>();
  const { dataset, setDataset } = useOptimization();

  const [name, setName] = useState(dataset?.name || '');
  const [objective, setObjective] = useState(dataset?.objective || '');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!datasetId) return;
    setIsSaving(true);
    try {
      // TODO: API call
      // await optimizationApi.updateDataset(datasetId, { name, objective });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (!datasetId) return;
    // TODO: API call to reset pipeline
    // await optimizationApi.resetPipeline(datasetId);
    navigate(`/optimization/${datasetId}`);
  };

  const handleDelete = async () => {
    if (!datasetId) return;
    // TODO: API call to delete
    // await optimizationApi.deleteDataset(datasetId);
    navigate('/optimization');
  };

  if (!dataset) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b px-6 py-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(`/optimization/${datasetId}`)}
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <div className="text-sm text-muted-foreground">
              Model Optimization &gt; {dataset.name} &gt; Settings
            </div>
            <h1 className="text-xl font-semibold">Settings</h1>
          </div>
        </div>
      </header>

      <div className="container max-w-2xl mx-auto py-8 space-y-6">
        {/* General Settings */}
        <Card>
          <CardHeader>
            <CardTitle>General</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Dataset Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="objective">Training Objective</Label>
              <Textarea
                id="objective"
                value={objective}
                onChange={(e) => setObjective(e.target.value)}
                rows={3}
              />
            </div>

            <div className="text-sm text-muted-foreground">
              <p>Created: {new Date(dataset.createdAt).toLocaleDateString()}</p>
              <p>Updated: {new Date(dataset.updatedAt).toLocaleDateString()}</p>
              <p>ID: {dataset.id}</p>
            </div>

            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </CardContent>
        </Card>

        {/* Statistics */}
        <Card>
          <CardHeader>
            <CardTitle>Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Total Records:</span>
                <span className="ml-2 font-medium">{dataset.stats.totalRecords.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Balance Score:</span>
                <span className="ml-2 font-medium">{dataset.stats.balanceScore?.toFixed(2) || 'N/A'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Valid Records:</span>
                <span className="ml-2 font-medium">{dataset.stats.validRecords.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Topics:</span>
                <span className="ml-2 font-medium">{dataset.stats.topicsCount}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Generated:</span>
                <span className="ml-2 font-medium">{dataset.stats.generatedRecords.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Training Runs:</span>
                <span className="ml-2 font-medium">{dataset.stats.trainingRuns}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Danger Zone */}
        <Card className="border-red-500/50">
          <CardHeader>
            <CardTitle className="text-red-500 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              Danger Zone
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Reset Pipeline */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Reset Pipeline</p>
                <p className="text-sm text-muted-foreground">
                  Clear all progress and start over. Records are preserved.
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline">Reset Pipeline</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reset Pipeline?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will clear all pipeline progress including topics, coverage analysis,
                      grader configuration, and dry run results. Records will be preserved.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleReset}>Reset</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            <div className="border-t pt-4" />

            {/* Delete Dataset */}
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Delete Dataset</p>
                <p className="text-sm text-muted-foreground">
                  Permanently delete this dataset and all records. Cannot be undone.
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">Delete Dataset</Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Dataset?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete the dataset
                      "{dataset.name}" and all {dataset.stats.totalRecords.toLocaleString()} records.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDelete}
                      className="bg-red-500 hover:bg-red-600"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
```

---

## Phase 8: API Integration

### 8.1 API Service

**File:** `src/services/optimization-api.ts`

```typescript
import { apiClient } from '@/lib/api-client';
import {
  OptimizationDataset,
  DatasetRecord,
  TopicHierarchy,
  CoverageReport,
  GraderConfig,
  DryRunReport,
  TrainingConfig,
  TrainingJob,
  GenerationConfig,
  GenerationPlan,
} from '@/types/optimization-types';

const BASE_URL = '/api/optimization';

export const optimizationApi = {
  // ============================================================
  // DATASETS
  // ============================================================

  async listDatasets(): Promise<OptimizationDataset[]> {
    const response = await apiClient.get(`${BASE_URL}/datasets`);
    return response.data;
  },

  async getDataset(id: string): Promise<OptimizationDataset> {
    const response = await apiClient.get(`${BASE_URL}/datasets/${id}`);
    return response.data;
  },

  async createFromTraces(params: {
    name: string;
    objective: string;
    traceIds: string[];
  }): Promise<OptimizationDataset> {
    const response = await apiClient.post(`${BASE_URL}/datasets/from-traces`, params);
    return response.data;
  },

  async createFromUpload(params: {
    name: string;
    objective: string;
    file: File;
  }): Promise<OptimizationDataset> {
    const formData = new FormData();
    formData.append('name', params.name);
    formData.append('objective', params.objective);
    formData.append('file', params.file);

    const response = await apiClient.post(`${BASE_URL}/datasets/from-upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  async updateDataset(id: string, params: {
    name?: string;
    objective?: string;
  }): Promise<OptimizationDataset> {
    const response = await apiClient.patch(`${BASE_URL}/datasets/${id}`, params);
    return response.data;
  },

  async deleteDataset(id: string): Promise<void> {
    await apiClient.delete(`${BASE_URL}/datasets/${id}`);
  },

  async duplicateDataset(id: string): Promise<OptimizationDataset> {
    const response = await apiClient.post(`${BASE_URL}/datasets/${id}/duplicate`);
    return response.data;
  },

  async resetPipeline(id: string): Promise<OptimizationDataset> {
    const response = await apiClient.post(`${BASE_URL}/datasets/${id}/reset`);
    return response.data;
  },

  // ============================================================
  // RECORDS
  // ============================================================

  async getRecords(datasetId: string): Promise<DatasetRecord[]> {
    const response = await apiClient.get(`${BASE_URL}/datasets/${datasetId}/records`);
    return response.data;
  },

  async importRecords(datasetId: string, params: {
    mode: 'append' | 'replace';
    file: File;
  }): Promise<{ imported: number; errors: number }> {
    const formData = new FormData();
    formData.append('mode', params.mode);
    formData.append('file', params.file);

    const response = await apiClient.post(
      `${BASE_URL}/datasets/${datasetId}/records/import`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return response.data;
  },

  async deleteRecords(datasetId: string, recordIds: string[]): Promise<void> {
    await apiClient.post(`${BASE_URL}/datasets/${datasetId}/records/delete`, { recordIds });
  },

  async exportRecords(datasetId: string): Promise<Blob> {
    const response = await apiClient.get(`${BASE_URL}/datasets/${datasetId}/records/export`, {
      responseType: 'blob',
    });
    return response.data;
  },

  // ============================================================
  // TOPICS
  // ============================================================

  async generateTopics(datasetId: string, params?: {
    method?: 'auto' | 'template';
    templateId?: string;
    maxDepth?: number;
    instructions?: string;
  }): Promise<TopicHierarchy> {
    const response = await apiClient.post(
      `${BASE_URL}/datasets/${datasetId}/topics/generate`,
      params
    );
    return response.data;
  },

  async updateTopics(datasetId: string, hierarchy: TopicHierarchy): Promise<void> {
    await apiClient.put(`${BASE_URL}/datasets/${datasetId}/topics`, hierarchy);
  },

  async categorizeRecords(datasetId: string, params?: {
    mode?: 'unlabeled_only' | 'recategorize_all';
  }): Promise<{ categorized: number; lowConfidence: number }> {
    const response = await apiClient.post(
      `${BASE_URL}/datasets/${datasetId}/topics/categorize`,
      params
    );
    return response.data;
  },

  async importTopics(datasetId: string, params: {
    file: File;
    keepAssignments: boolean;
  }): Promise<TopicHierarchy> {
    const formData = new FormData();
    formData.append('file', params.file);
    formData.append('keepAssignments', String(params.keepAssignments));

    const response = await apiClient.post(
      `${BASE_URL}/datasets/${datasetId}/topics/import`,
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    );
    return response.data;
  },

  async exportTopics(datasetId: string): Promise<Blob> {
    const response = await apiClient.get(`${BASE_URL}/datasets/${datasetId}/topics/export`, {
      responseType: 'blob',
    });
    return response.data;
  },

  // ============================================================
  // COVERAGE
  // ============================================================

  async getCoverage(datasetId: string): Promise<CoverageReport> {
    const response = await apiClient.get(`${BASE_URL}/datasets/${datasetId}/coverage`);
    return response.data;
  },

  // ============================================================
  // GENERATION
  // ============================================================

  async createGenerationPlan(datasetId: string, config: GenerationConfig): Promise<GenerationPlan> {
    const response = await apiClient.post(
      `${BASE_URL}/datasets/${datasetId}/generate/plan`,
      config
    );
    return response.data;
  },

  async generateRecords(datasetId: string, params: {
    config: GenerationConfig;
    sourceRecordIds?: string[];
  }): Promise<{ generated: number; valid: number }> {
    const response = await apiClient.post(
      `${BASE_URL}/datasets/${datasetId}/generate`,
      params
    );
    return response.data;
  },

  // ============================================================
  // GRADER
  // ============================================================

  async updateGrader(datasetId: string, config: GraderConfig): Promise<void> {
    await apiClient.put(`${BASE_URL}/datasets/${datasetId}/grader`, config);
  },

  async testGrader(datasetId: string, sampleSize?: number): Promise<{
    results: Array<{ recordId: string; score: number; reasoning?: string }>;
    statistics: { mean: number; std: number; min: number; max: number };
  }> {
    const response = await apiClient.post(`${BASE_URL}/datasets/${datasetId}/grader/test`, {
      sampleSize: sampleSize ?? 5,
    });
    return response.data;
  },

  // ============================================================
  // DRY RUN
  // ============================================================

  async runDryRun(datasetId: string, sampleSize?: number): Promise<DryRunReport> {
    const response = await apiClient.post(`${BASE_URL}/datasets/${datasetId}/dry-run`, {
      sampleSize: sampleSize ?? 300,
    });
    return response.data;
  },

  async getDryRunResults(datasetId: string): Promise<DryRunReport | null> {
    const response = await apiClient.get(`${BASE_URL}/datasets/${datasetId}/dry-run`);
    return response.data;
  },

  // ============================================================
  // TRAINING
  // ============================================================

  async startTraining(datasetId: string, config: TrainingConfig): Promise<TrainingJob> {
    const response = await apiClient.post(`${BASE_URL}/datasets/${datasetId}/train`, config);
    return response.data;
  },

  async getTrainingJob(jobId: string): Promise<TrainingJob> {
    const response = await apiClient.get(`${BASE_URL}/training/${jobId}`);
    return response.data;
  },

  async cancelTraining(jobId: string): Promise<void> {
    await apiClient.post(`${BASE_URL}/training/${jobId}/cancel`);
  },

  // ============================================================
  // DEPLOYMENT
  // ============================================================

  async deploy(datasetId: string, params: {
    mode: 'replace' | 'new_endpoint' | 'ab_test';
    abTestRatio?: number;
  }): Promise<{ modelId: string; endpoint?: string }> {
    const response = await apiClient.post(`${BASE_URL}/datasets/${datasetId}/deploy`, params);
    return response.data;
  },
};
```

---

## Implementation Timeline

### Week 1-2: Foundation & List Page

| Day | Tasks |
|-----|-------|
| 1-2 | Phase 1: Types, Context, Routes |
| 3-4 | Phase 2: Datasets List Page |
| 5-6 | Phase 2: Dataset Card, Mini Progress |
| 7-8 | Phase 3: Create Dataset Page (traces tab) |
| 9-10 | Phase 3: Create Dataset Page (upload tab) |

### Week 3-4: Canvas Core

| Day | Tasks |
|-----|-------|
| 11-12 | Phase 4: Canvas Layout, Header, Health |
| 13-14 | Phase 4: Pipeline Canvas with React Flow |
| 15-16 | Phase 4: Pipeline Node Component |
| 17-18 | Phase 6: Records Overlay |
| 19-20 | Phase 6: Records Table, Filters |

### Week 5-6: Step Modals

| Day | Tasks |
|-----|-------|
| 21-22 | Phase 5: Topics Editor Modal |
| 23-24 | Phase 5: Coverage Dashboard Modal |
| 25-26 | Phase 5: Generate Variations Modal |
| 27-28 | Phase 5: Configure Grader Modal |
| 29-30 | Phase 5: Dry Run Results Modal |

### Week 7: Training & Polish

| Day | Tasks |
|-----|-------|
| 31-32 | Phase 5: Start Training Modal |
| 33-34 | Phase 5: Deploy Modal |
| 35 | Phase 7: Settings Page |
| 36-37 | Phase 8: API Integration |
| 38-40 | Testing, Bug Fixes, Polish |

---

## Summary

This implementation plan covers:

1. **4 main pages**: List, Create, Canvas, Settings
2. **10 modals** for step configuration
3. **React Flow canvas** for visual pipeline
4. **Comprehensive state management** via Context
5. **Full API integration** layer

The visual pipeline interface provides an intuitive way for users to:
- Track progress through 7 pipeline steps
- Configure each step via dedicated modals
- Monitor data health in real-time
- Generate synthetic data to fill gaps
- Execute RFT training and deployment

Start with Phase 1 (Foundation) and progress sequentially for best results.
