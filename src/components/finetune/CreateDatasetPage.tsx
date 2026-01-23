import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useFinetuneContext } from './FinetuneContext';
import { Trace } from './types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  ChevronLeft,
  Search,
  Upload,
  FileJson,
  GraduationCap,
  Sparkles,
  RefreshCw,
  ChevronRight,
  Satellite,
  BookOpen,
  Wrench,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

// Trace item component
function TraceItem({ trace, isSelected, onToggle }: {
  trace: Trace;
  isSelected: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg border transition-colors cursor-pointer",
        isSelected
          ? "border-blue-500/50 bg-blue-500/10"
          : "border-zinc-800 bg-zinc-900/30 hover:border-zinc-700"
      )}
      onClick={onToggle}
    >
      <Checkbox
        checked={isSelected}
        onCheckedChange={onToggle}
        className="mt-0.5"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-zinc-300 truncate">
          "{trace.systemPrompt.slice(0, 50)}..."
        </p>
        <p className="text-xs text-zinc-500 mt-1">
          {trace.model} &bull; {trace.turns} turns &bull; {formatDistanceToNow(trace.timestamp, { addSuffix: true })}
        </p>
      </div>
    </div>
  );
}

// Upload zone component
function UploadZone({ onFileSelect }: { onFileSelect: (file: File) => void }) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.jsonl')) {
      onFileSelect(file);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelect(file);
    }
  };

  return (
    <div
      className={cn(
        "border-2 border-dashed rounded-xl p-12 text-center transition-colors",
        isDragging ? "border-blue-500 bg-blue-500/10" : "border-zinc-700 hover:border-zinc-600"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <FileJson className="w-12 h-12 mx-auto text-zinc-500 mb-4" />
      <p className="text-zinc-300 mb-2">
        Drag & drop your file here
      </p>
      <p className="text-zinc-500 text-sm mb-4">
        or click to browse
      </p>
      <label>
        <input
          type="file"
          accept=".jsonl"
          className="hidden"
          onChange={handleFileInput}
        />
        <Button variant="outline" asChild>
          <span>Browse Files</span>
        </Button>
      </label>
      <p className="text-zinc-600 text-xs mt-4">
        Supported: .jsonl
      </p>
    </div>
  );
}

// Detected pattern card
function DetectedPatternCard({ pattern }: {
  pattern: {
    title: string;
    icon: string;
    systemPrompt: string;
    capabilities: string[];
    toolCount: number;
  } | null;
}) {
  if (!pattern) {
    return (
      <div className="bg-zinc-800/30 border border-zinc-700/50 rounded-xl p-5">
        <div className="flex items-center gap-2 text-zinc-500 mb-3">
          <Search className="w-4 h-4" />
          <span className="font-medium">Detected Pattern</span>
        </div>
        <p className="text-zinc-400 text-sm">
          No traces selected
        </p>
        <p className="text-zinc-500 text-xs mt-2">
          Select traces from the left panel to see auto-detected patterns.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-zinc-800/30 border border-zinc-700/50 rounded-xl p-5">
      <div className="flex items-center gap-2 text-zinc-400 mb-3">
        <Sparkles className="w-4 h-4" />
        <span className="font-medium">Detected Pattern</span>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
          <GraduationCap className="w-5 h-5 text-blue-400" />
        </div>
        <div>
          <h4 className="font-semibold text-zinc-100">{pattern.title}</h4>
          <p className="text-xs text-zinc-500">Assistant</p>
        </div>
      </div>

      <div className="mb-4">
        <p className="text-xs text-zinc-500 mb-1">System prompt:</p>
        <p className="text-sm text-zinc-300 line-clamp-3">
          "{pattern.systemPrompt}"
        </p>
        <button className="text-xs text-blue-400 hover:text-blue-300 mt-1">
          Expand
        </button>
      </div>

      <div>
        <p className="text-xs text-zinc-500 mb-2">Detected:</p>
        <div className="flex flex-wrap gap-1.5">
          {pattern.capabilities.map((cap, i) => (
            <span key={i} className="px-2 py-0.5 bg-zinc-700/50 rounded text-xs text-zinc-300">
              {cap}
            </span>
          ))}
          {pattern.toolCount > 0 && (
            <span className="px-2 py-0.5 bg-zinc-700/50 rounded text-xs text-zinc-300 flex items-center gap-1">
              <Wrench className="w-3 h-3" />
              {pattern.toolCount} tools
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// Empty state for no traces
function EmptyTracesState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="w-16 h-16 rounded-2xl bg-zinc-800/50 flex items-center justify-center mb-4 relative">
        <Satellite className="w-8 h-8 text-zinc-500" />
        <span className="absolute -right-1 -top-1 w-3 h-3 bg-blue-500 rounded-full animate-pulse" />
      </div>
      <h3 className="text-lg font-semibold text-zinc-200 mb-2">No traces found</h3>
      <p className="text-zinc-400 text-center text-sm max-w-xs mb-6">
        Send chat completion requests through the gateway to get started.
      </p>
      <Button variant="outline" className="gap-2">
        <BookOpen className="w-4 h-4" />
        View Gateway Setup Guide
      </Button>
      <p className="text-xs text-zinc-500 mt-6 flex items-center gap-2">
        Listening for new traces...
        <RefreshCw className="w-3 h-3 animate-spin" />
      </p>
    </div>
  );
}

export function CreateDatasetPage() {
  const navigate = useNavigate();
  const {
    traces,
    selectedTraceIds,
    toggleTraceSelection,
    selectAllTraces,
    clearTraceSelection,
    detectedPattern,
    createDataset,
  } = useFinetuneContext();

  const [activeTab, setActiveTab] = useState('traces');
  const [searchQuery, setSearchQuery] = useState('');
  const [timeRange, setTimeRange] = useState('7d');
  const [modelFilter, setModelFilter] = useState('all');
  const [minTurns, setMinTurns] = useState('1');
  const [hasResponse, setHasResponse] = useState(true);

  const [datasetName, setDatasetName] = useState('');
  const [objective, setObjective] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Filter traces
  const filteredTraces = useMemo(() => {
    return traces.filter(trace => {
      // Time range filter
      const now = Date.now();
      const traceAge = now - trace.timestamp.getTime();
      const maxAge = {
        '24h': 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000,
        '30d': 30 * 24 * 60 * 60 * 1000,
        'all': Infinity,
      }[timeRange] || Infinity;

      if (traceAge > maxAge) return false;

      // Model filter
      if (modelFilter !== 'all' && trace.model !== modelFilter) return false;

      // Min turns filter
      if (trace.turns < parseInt(minTurns)) return false;

      // Search filter
      if (searchQuery && !trace.systemPrompt.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }

      return true;
    });
  }, [traces, timeRange, modelFilter, minTurns, searchQuery]);

  // Get unique models for filter
  const uniqueModels = useMemo(() => {
    return Array.from(new Set(traces.map(t => t.model)));
  }, [traces]);

  // Counts
  const selectedCount = selectedTraceIds.size;
  const isFormValid = selectedCount > 0 && datasetName.trim() && objective.trim();

  // Handlers
  const handleSelectAll = () => {
    if (selectedCount === filteredTraces.length) {
      clearTraceSelection();
    } else {
      selectAllTraces();
    }
  };

  const handleCreate = async () => {
    if (!isFormValid) return;

    setIsCreating(true);
    try {
      const datasetId = await createDataset(datasetName, objective, Array.from(selectedTraceIds));
      navigate(`/optimization/${datasetId}`);
    } catch (error) {
      console.error('Failed to create dataset:', error);
      setIsCreating(false);
    }
  };

  const handleFileSelect = (file: File) => {
    // Mock file handling - just auto-fill form
    setDatasetName(file.name.replace('.jsonl', ''));
    setObjective('Improve response quality and consistency...');
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="border-b border-zinc-800 px-6 py-4">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/optimization')}
            className="text-zinc-400 hover:text-zinc-200"
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <span>Model Optimization</span>
              <ChevronRight className="w-4 h-4" />
              <span className="text-zinc-200">New Dataset</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Data Source */}
        <div className="flex-1 border-r border-zinc-800 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-zinc-800">
            <h2 className="font-semibold text-zinc-100 mb-4">Select Traces</h2>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="traces" className="gap-2">
                  <Satellite className="w-4 h-4" />
                  From Gateway Traces
                </TabsTrigger>
                <TabsTrigger value="upload" className="gap-2">
                  <Upload className="w-4 h-4" />
                  Upload File
                </TabsTrigger>
              </TabsList>

              <TabsContent value="traces" className="mt-0">
                {/* Filters */}
                <div className="grid grid-cols-2 gap-3 mb-4">
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
                  <Select value={modelFilter} onValueChange={setModelFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Model" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All models</SelectItem>
                      {uniqueModels.map(model => (
                        <SelectItem key={model} value={model}>{model}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={minTurns} onValueChange={setMinTurns}>
                    <SelectTrigger>
                      <SelectValue placeholder="Min Turns" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Min 1 turn</SelectItem>
                      <SelectItem value="2">Min 2 turns</SelectItem>
                      <SelectItem value="3">Min 3 turns</SelectItem>
                      <SelectItem value="5">Min 5 turns</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="hasResponse"
                      checked={hasResponse}
                      onCheckedChange={(checked) => setHasResponse(!!checked)}
                    />
                    <label htmlFor="hasResponse" className="text-sm text-zinc-400 cursor-pointer">
                      Has assistant response
                    </label>
                  </div>
                </div>

                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                  <Input
                    placeholder="Search traces..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </TabsContent>

              <TabsContent value="upload" className="mt-0">
                <UploadZone onFileSelect={handleFileSelect} />
                <div className="mt-4 p-4 bg-zinc-800/30 rounded-lg">
                  <h4 className="text-sm font-medium text-zinc-300 mb-2">Format Requirements</h4>
                  <ul className="text-xs text-zinc-400 space-y-1">
                    <li>&bull; Each line must be a JSON object with messages[]</li>
                    <li>&bull; Optional: tools[], tool_choice</li>
                  </ul>
                  <button className="text-xs text-blue-400 hover:text-blue-300 mt-2 flex items-center gap-1">
                    <BookOpen className="w-3 h-3" />
                    View Format Guide
                  </button>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* Trace List */}
          {activeTab === 'traces' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                <p className="text-sm text-zinc-400">
                  Matching: <span className="text-zinc-200">{filteredTraces.length}</span> of {traces.length} total
                </p>
              </div>

              {traces.length === 0 ? (
                <EmptyTracesState />
              ) : filteredTraces.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8">
                  <Search className="w-12 h-12 text-zinc-600 mb-4" />
                  <p className="text-zinc-400 mb-2">No traces match your filters</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setTimeRange('all');
                      setModelFilter('all');
                      setMinTurns('1');
                      setSearchQuery('');
                    }}
                  >
                    Clear All Filters
                  </Button>
                </div>
              ) : (
                <>
                  <div className="px-4 py-2 border-b border-zinc-800">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={selectedCount === filteredTraces.length && filteredTraces.length > 0}
                        onCheckedChange={handleSelectAll}
                      />
                      <span className="text-sm text-zinc-400">
                        Select All ({filteredTraces.length})
                      </span>
                    </label>
                  </div>
                  <div className="flex-1 overflow-auto p-4 space-y-2">
                    {filteredTraces.map(trace => (
                      <TraceItem
                        key={trace.id}
                        trace={trace}
                        isSelected={selectedTraceIds.has(trace.id)}
                        onToggle={() => toggleTraceSelection(trace.id)}
                      />
                    ))}
                  </div>
                </>
              )}

              {selectedCount > 0 && (
                <div className="px-4 py-3 border-t border-zinc-800 bg-zinc-900/50">
                  <p className="text-sm font-medium text-zinc-200 mb-2">
                    Selected: {selectedCount} traces
                  </p>
                  <div className="text-xs text-zinc-500">
                    By model:
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 bg-blue-500/30 rounded h-2" />
                      <span>{selectedCount}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Panel - Configure */}
        <div className="w-96 flex flex-col overflow-auto p-6">
          <h2 className="font-semibold text-zinc-100 mb-4">Configure Dataset</h2>

          <DetectedPatternCard pattern={detectedPattern} />

          <div className="h-px bg-zinc-800 my-6" />

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Dataset Name *
              </label>
              <Input
                placeholder="e.g., chess-tutor"
                value={datasetName}
                onChange={e => setDatasetName(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-300 mb-2">
                Training Objective *
              </label>
              <Textarea
                placeholder="Describe what you want the model to learn or improve..."
                value={objective}
                onChange={e => setObjective(e.target.value)}
                rows={4}
              />
              <p className="text-xs text-zinc-500 mt-2 flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                This helps us configure the optimal grader for RFT
              </p>
            </div>
          </div>

          <div className="mt-auto pt-6">
            <Button
              className="w-full gap-2"
              size="lg"
              disabled={!isFormValid || isCreating}
              onClick={handleCreate}
            >
              {isCreating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  Create Dataset & Start
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
