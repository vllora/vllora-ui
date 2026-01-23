import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { useFinetuneContext } from './FinetuneContext';
import { DatasetSummary, PipelineStep } from './types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Plus,
  Search,
  MoreVertical,
  Rocket,
  CheckCircle2,
  AlertTriangle,
  Circle,
  Loader2,
  XCircle,
  Copy,
  Download,
  Trash2,
  ExternalLink,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

// Pipeline step indicator component
function PipelineProgress({ currentStep, status }: { currentStep: PipelineStep; status: DatasetSummary['status'] }) {
  const steps = [1, 2, 3, 4, 5, 6, 7] as PipelineStep[];

  const getStepIcon = (step: PipelineStep) => {
    if (step < currentStep) {
      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    }
    if (step === currentStep) {
      if (status === 'training') {
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      }
      if (status === 'attention') {
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      }
      if (status === 'failed') {
        return <XCircle className="w-4 h-4 text-red-500" />;
      }
      if (status === 'complete') {
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      }
      return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
    }
    return <Circle className="w-4 h-4 text-zinc-600" />;
  };

  return (
    <div className="flex items-center gap-1">
      {steps.map((step, index) => (
        <React.Fragment key={step}>
          {getStepIcon(step)}
          {index < steps.length - 1 && (
            <div className={cn(
              "w-3 h-0.5",
              step < currentStep ? "bg-green-500" : "bg-zinc-700"
            )} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// Dataset card component
function DatasetCard({ dataset, onOpen, onDuplicate, onExport, onDelete }: {
  dataset: DatasetSummary;
  onOpen: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-colors cursor-pointer group"
      onClick={onOpen}
    >
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-lg font-semibold text-zinc-100 group-hover:text-white transition-colors">
          {dataset.name}
        </h3>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-zinc-200">
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onOpen(); }}>
              <ExternalLink className="w-4 h-4 mr-2" />
              Open
            </DropdownMenuItem>
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
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="text-red-400 focus:text-red-400"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <p className="text-sm text-zinc-400 mb-4">
        {dataset.recordCount.toLocaleString()} records &bull; {dataset.topicCount} topics &bull; Balance: {dataset.balanceScore.toFixed(2)}
      </p>

      <div className="bg-zinc-800/50 rounded-lg p-3 mb-3">
        <PipelineProgress currentStep={dataset.currentStep} status={dataset.status} />
        <p className={cn(
          "text-sm mt-2",
          dataset.status === 'complete' ? "text-green-400" :
          dataset.status === 'attention' ? "text-yellow-400" :
          dataset.status === 'failed' ? "text-red-400" :
          "text-zinc-400"
        )}>
          {dataset.status === 'complete' && dataset.improvement && (
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Deployed &bull; +{dataset.improvement}% improvement
            </span>
          )}
          {dataset.status !== 'complete' && dataset.statusText}
        </p>
      </div>

      <p className="text-xs text-zinc-500">
        Updated: {formatDistanceToNow(dataset.updatedAt, { addSuffix: true })}
      </p>
    </div>
  );
}

// Empty state component
function EmptyState({ onCreateNew }: { onCreateNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="w-16 h-16 rounded-2xl bg-zinc-800/50 flex items-center justify-center mb-6">
        <Rocket className="w-8 h-8 text-zinc-500" />
      </div>
      <h3 className="text-xl font-semibold text-zinc-200 mb-2">No datasets yet</h3>
      <p className="text-zinc-400 text-center max-w-md mb-6">
        Create your first dataset from gateway traces to start training custom models.
      </p>
      <Button onClick={onCreateNew} className="gap-2">
        <Plus className="w-4 h-4" />
        Create Dataset
      </Button>
    </div>
  );
}

export function DatasetsListPage() {
  const navigate = useNavigate();
  const { datasetSummaries, loadingDatasets, deleteDataset, duplicateDataset } = useFinetuneContext();

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('updated');
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [datasetToDelete, setDatasetToDelete] = useState<DatasetSummary | null>(null);

  // Filter and sort datasets
  const filteredDatasets = datasetSummaries
    .filter(d => {
      if (searchQuery && !d.name.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      if (statusFilter !== 'all' && d.status !== statusFilter) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'records':
          return b.recordCount - a.recordCount;
        case 'updated':
        default:
          return b.updatedAt.getTime() - a.updatedAt.getTime();
      }
    });

  const handleCreateNew = () => {
    navigate('/optimization/new');
  };

  const handleOpenDataset = (id: string) => {
    navigate(`/optimization/${id}`);
  };

  const handleDuplicate = async (dataset: DatasetSummary) => {
    try {
      const newId = await duplicateDataset(dataset.id);
      navigate(`/optimization/${newId}`);
    } catch (error) {
      console.error('Failed to duplicate dataset:', error);
    }
  };

  const handleExport = (dataset: DatasetSummary) => {
    // Mock export - just log for now
    console.log('Export dataset:', dataset.name);
  };

  const handleDeleteClick = (dataset: DatasetSummary) => {
    setDatasetToDelete(dataset);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (datasetToDelete) {
      await deleteDataset(datasetToDelete.id);
      setDeleteDialogOpen(false);
      setDatasetToDelete(null);
    }
  };

  if (loadingDatasets) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-auto bg-background">
      <div className="w-full max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-zinc-100">Your Datasets</h1>
          <Button onClick={handleCreateNew} className="gap-2">
            <Plus className="w-4 h-4" />
            New Dataset
          </Button>
        </div>

        {datasetSummaries.length === 0 ? (
          <EmptyState onCreateNew={handleCreateNew} />
        ) : (
          <>
            {/* Toolbar */}
            <div className="flex items-center gap-4 mb-6">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <Input
                  placeholder="Search datasets..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
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
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="updated">Last Updated</SelectItem>
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="records">Records Count</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Dataset Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredDatasets.map(dataset => (
                <DatasetCard
                  key={dataset.id}
                  dataset={dataset}
                  onOpen={() => handleOpenDataset(dataset.id)}
                  onDuplicate={() => handleDuplicate(dataset)}
                  onExport={() => handleExport(dataset)}
                  onDelete={() => handleDeleteClick(dataset)}
                />
              ))}
            </div>

            {filteredDatasets.length === 0 && (
              <div className="text-center py-12 text-zinc-500">
                No datasets match your filters
              </div>
            )}
          </>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Dataset</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{datasetToDelete?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
