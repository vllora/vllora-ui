import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useState, useEffect, useMemo } from "react";
import { DatasetsConsumer } from "@/contexts/DatasetsContext";
import { Span } from "@/types/common-type";
import { toast } from "sonner";
import { Database, Plus, ArrowRight, ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface DatasetWithCount {
  id: string;
  name: string;
  recordCount: number;
}

interface AddToDatasetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  spans: Span[];
  onSuccess?: () => void;
}

export function AddToDatasetDialog({
  open,
  onOpenChange,
  spans,
  onSuccess,
}: AddToDatasetDialogProps) {
  const { datasets, createDataset, addSpansToDataset, getRecordCount } = DatasetsConsumer();
  const [datasetsWithCounts, setDatasetsWithCounts] = useState<DatasetWithCount[]>([]);
  const [datasetSearch, setDatasetSearch] = useState('');
  const [selectedDataset, setSelectedDataset] = useState<DatasetWithCount | null>(null);
  const [isDatasetPopoverOpen, setIsDatasetPopoverOpen] = useState(false);
  const [topic, setTopic] = useState('');
  const [isTopicPopoverOpen, setIsTopicPopoverOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  // Load record counts when dialog opens
  useEffect(() => {
    if (open && datasets.length > 0) {
      const loadCounts = async () => {
        const withCounts = await Promise.all(
          datasets.map(async (ds) => ({
            id: ds.id,
            name: ds.name,
            recordCount: await getRecordCount(ds.id),
          }))
        );
        setDatasetsWithCounts(withCounts);
      };
      loadCounts();
    } else if (open && datasets.length === 0) {
      setDatasetsWithCounts([]);
    }
  }, [open, datasets, getRecordCount]);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setDatasetSearch('');
      setSelectedDataset(null);
      setTopic('');
      setIsDatasetPopoverOpen(false);
      setIsTopicPopoverOpen(false);
    }
  }, [open]);

  // Filter datasets based on search query
  const filteredDatasets = useMemo(() => {
    if (!datasetSearch.trim()) return datasetsWithCounts;
    const query = datasetSearch.toLowerCase();
    return datasetsWithCounts.filter((ds) =>
      ds.name.toLowerCase().includes(query)
    );
  }, [datasetsWithCounts, datasetSearch]);

  // Check if search matches an existing dataset exactly
  const exactMatch = useMemo(() => {
    return datasetsWithCounts.find(
      (ds) => ds.name.toLowerCase() === datasetSearch.toLowerCase()
    );
  }, [datasetsWithCounts, datasetSearch]);

  // Show "create new" option if search doesn't match existing
  const showCreateOption = datasetSearch.trim() && !exactMatch;

  // Common topics for dropdown suggestions
  const topicSuggestions = [
    "flight_search",
    "hotel_booking",
    "error_handling",
    "user_auth",
    "payment",
    "general",
  ];

  const handleSelectDataset = (ds: DatasetWithCount) => {
    setSelectedDataset(ds);
    setDatasetSearch(ds.name);
    setIsDatasetPopoverOpen(false);
  };

  const handleCreateNewDataset = async () => {
    if (!datasetSearch.trim()) return;

    setIsCreatingNew(true);
    try {
      const newDataset = await createDataset(datasetSearch);
      const newDs = { id: newDataset.id, name: newDataset.name, recordCount: 0 };
      setDatasetsWithCounts(prev => [newDs, ...prev]);
      setSelectedDataset(newDs);
      setIsDatasetPopoverOpen(false);
      toast.success(`Created dataset "${newDataset.name}"`);
    } catch {
      toast.error('Failed to create dataset');
    } finally {
      setIsCreatingNew(false);
    }
  };

  const handleSubmit = async () => {
    if (spans.length === 0) return;

    if (!selectedDataset) {
      toast.error('Please select or create a dataset');
      return;
    }

    setIsSubmitting(true);
    try {
      const addedCount = await addSpansToDataset(selectedDataset.id, spans, topic || undefined);

      toast.success(`Added ${addedCount} span${addedCount !== 1 ? 's' : ''} to "${selectedDataset.name}"`);

      onOpenChange(false);
      onSuccess?.();
    } catch {
      toast.error('Failed to add spans to dataset');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Display value for dataset input
  const datasetDisplayValue = selectedDataset ? selectedDataset.name : datasetSearch;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 gap-0" onClick={(e) => e.stopPropagation()}>
        <div className="p-5 space-y-5">
          {/* Header */}
          <div className="space-y-1">
            <div className="flex items-center gap-2 font-semibold text-lg">
              <Database className="w-5 h-5 text-[rgb(var(--theme-500))]" />
              <span>Add to Dataset</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Adding {spans.length} span{spans.length !== 1 ? 's' : ''} to a dataset
            </p>
          </div>

          {/* Dataset Selection - Combobox style */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Select or Create Dataset
            </label>
            <Popover open={isDatasetPopoverOpen} onOpenChange={setIsDatasetPopoverOpen}>
              <PopoverTrigger asChild>
                <div className="relative" onClick={() => setIsDatasetPopoverOpen(true)}>
                  <Input
                    value={datasetDisplayValue}
                    onChange={(e) => {
                      setDatasetSearch(e.target.value);
                      setSelectedDataset(null);
                      if (!isDatasetPopoverOpen) setIsDatasetPopoverOpen(true);
                    }}
                    placeholder="Search or enter new dataset name..."
                    className="bg-muted/30 pr-8"
                  />
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-1 max-h-64 overflow-y-auto" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                {/* Create new option */}
                {showCreateOption && (
                  <button
                    type="button"
                    onClick={handleCreateNewDataset}
                    disabled={isCreatingNew}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm rounded-md transition-colors text-left hover:bg-[rgb(var(--theme-500))]/15 text-[rgb(var(--theme-500))] border-b border-border/50 mb-1"
                  >
                    <Plus className="w-4 h-4" />
                    Create "{datasetSearch}"
                  </button>
                )}

                {/* Existing datasets */}
                {filteredDatasets.length === 0 && !showCreateOption ? (
                  <div className="text-sm text-muted-foreground text-center py-4">
                    No datasets yet. Type a name to create one.
                  </div>
                ) : (
                  filteredDatasets.map((ds) => (
                    <button
                      key={ds.id}
                      type="button"
                      onClick={() => handleSelectDataset(ds)}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2.5 text-sm rounded-md transition-colors text-left",
                        selectedDataset?.id === ds.id
                          ? "bg-[rgb(var(--theme-500))]/15 text-foreground"
                          : "hover:bg-muted/50 text-foreground"
                      )}
                    >
                      <Check className={cn("w-4 h-4 flex-shrink-0", selectedDataset?.id === ds.id ? "opacity-100" : "opacity-0")} />
                      <span className="flex-1 truncate">{ds.name}</span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {ds.recordCount} record{ds.recordCount !== 1 ? 's' : ''}
                      </span>
                    </button>
                  ))
                )}
              </PopoverContent>
            </Popover>
          </div>

          {/* Topic Selection - Combobox style */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Assign Topic <span className="font-normal">(Optional)</span>
            </label>
            <Popover open={isTopicPopoverOpen} onOpenChange={setIsTopicPopoverOpen}>
              <PopoverTrigger asChild>
                <div className="relative" onClick={() => setIsTopicPopoverOpen(true)}>
                  <Input
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="Select or type a topic..."
                    className="bg-muted/30 pr-8"
                  />
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                </div>
              </PopoverTrigger>
              <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-1" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
                {topicSuggestions.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => {
                      setTopic(t);
                      setIsTopicPopoverOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors text-left",
                      topic === t
                        ? "bg-[rgb(var(--theme-500))]/15 text-foreground"
                        : "hover:bg-muted/50 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Check className={cn("w-4 h-4", topic === t ? "opacity-100" : "opacity-0")} />
                    {t}
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <Button
              variant="ghost"
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 gap-2 bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white"
              onClick={handleSubmit}
              disabled={isSubmitting || !selectedDataset}
            >
              Confirm Add
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
