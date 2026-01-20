/**
 * GenerateSyntheticDataDialog
 *
 * Dialog for configuring and generating synthetic data records.
 * Allows users to specify prompt, target topics, records per topic,
 * model selection, and diversity level.
 */

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Zap, Loader2, Info, ChevronDown, ChevronRight, FileText } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { getTopicColor, type AvailableTopic } from "./record-utils";
import type { DatasetRecord } from "@/types/dataset-types";
import { X } from "lucide-react";

export interface GenerationConfig {
  prompt: string;
  targetTopics: "all" | "selected";
  selectedTopics: string[];
  recordsPerTopic: number;
  model: string;
  diversityLevel: number; // 0-100
}

interface GenerateSyntheticDataDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Available topics from hierarchy */
  availableTopics: AvailableTopic[];
  /** Selected records to use as samples for generation */
  sampleRecords?: DatasetRecord[];
  /** Called when user clicks "Start Generation" */
  onGenerate: (config: GenerationConfig) => Promise<void>;
  /** Whether generation is in progress */
  isGenerating?: boolean;
}

const MODELS = [
  { value: "gpt-4o", label: "GPT-4o (Recommended)" },
  { value: "gpt-4o-mini", label: "GPT-4o Mini" },
  { value: "claude-3-5-sonnet", label: "Claude 3.5 Sonnet" },
  { value: "claude-3-5-haiku", label: "Claude 3.5 Haiku" },
];

const getDiversityLabel = (value: number): string => {
  if (value <= 25) return "Standard";
  if (value <= 50) return "Balanced";
  if (value <= 75) return "Creative";
  return "Highly Creative";
};

export function GenerateSyntheticDataDialog({
  open,
  onOpenChange,
  availableTopics,
  sampleRecords = [],
  onGenerate,
  isGenerating = false,
}: GenerateSyntheticDataDialogProps) {
  // Form state
  const [prompt, setPrompt] = useState("");
  const [targetTopics, setTargetTopics] = useState<"all" | "selected">("all");
  const [selectedTopics, setSelectedTopics] = useState<Set<string>>(new Set());
  const [recordsPerTopic, setRecordsPerTopic] = useState(10);
  const [model, setModel] = useState("gpt-4o");
  const [diversityLevel, setDiversityLevel] = useState(50);
  const [samplesExpanded, setSamplesExpanded] = useState(true);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setPrompt("");
      setTargetTopics("all");
      setSelectedTopics(new Set());
      setRecordsPerTopic(10);
      setModel("gpt-4o");
      setDiversityLevel(50);
    }
  }, [open]);

  const handleTopicToggle = (topicName: string) => {
    setSelectedTopics((prev) => {
      const next = new Set(prev);
      if (next.has(topicName)) {
        next.delete(topicName);
      } else {
        next.add(topicName);
      }
      return next;
    });
  };

  const handleGenerate = async () => {
    const config: GenerationConfig = {
      prompt,
      targetTopics,
      selectedTopics: Array.from(selectedTopics),
      recordsPerTopic,
      model,
      diversityLevel,
    };
    return onGenerate(config);
  };

  const canGenerate = useMemo(() => {
    if (!prompt.trim()) return false;
    if (targetTopics === "selected" && selectedTopics.size === 0) return false;
    if (recordsPerTopic < 1) return false;
    return true;
  }, [prompt, targetTopics, selectedTopics.size, recordsPerTopic]);

  const hasTopics = availableTopics.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            Generate Synthetic Data
          </DialogTitle>
          <DialogDescription>
            Augment your dataset with LLM-generated records
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 py-4">
          {/* Prompt / Direction */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Prompt / Direction</Label>
              <span className="text-xs text-muted-foreground uppercase">Required</span>
            </div>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g., Generate technical support queries focusing on Python syntax errors, edge cases in asynchronous programming, and common library conflicts..."
              className="min-h-[100px] resize-none bg-muted/30 border-border/50"
            />
            <p className="text-xs text-muted-foreground italic">
              Be specific about the domain, tone, and complexity level for better results.
            </p>
          </div>

          {/* Sample Records */}
          {sampleRecords.length > 0 && (
            <Collapsible open={samplesExpanded} onOpenChange={setSamplesExpanded}>
              <CollapsibleTrigger className="flex items-center gap-2 w-full text-left">
                <div className="flex items-center gap-2 flex-1">
                  {samplesExpanded ? (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  )}
                  <Label className="text-sm font-medium cursor-pointer">
                    Sample Records
                  </Label>
                  <span className="text-xs text-muted-foreground">
                    ({sampleRecords.length} selected)
                  </span>
                </div>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3">
                <div className="space-y-2 max-h-[200px] overflow-y-auto rounded-lg border border-border/50 bg-muted/20 p-3">
                  {sampleRecords.slice(0, 5).map((record, idx) => {
                    const preview = typeof record.data === "object" && record.data !== null
                      ? JSON.stringify(record.data).slice(0, 150)
                      : String(record.data).slice(0, 150);
                    return (
                      <div
                        key={record.id}
                        className="flex items-start gap-2 p-2 rounded bg-background/50 border border-border/30"
                      >
                        <FileText className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium text-muted-foreground">
                              #{idx + 1}
                            </span>
                            {record.topic && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-[rgb(var(--theme-500))]/10 text-[rgb(var(--theme-500))]">
                                {record.topic}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {preview}{preview.length >= 150 && "..."}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  {sampleRecords.length > 5 && (
                    <p className="text-xs text-muted-foreground text-center py-1">
                      +{sampleRecords.length - 5} more records
                    </p>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-2 italic">
                  These records will be used as examples to guide the generation style and format.
                </p>
              </CollapsibleContent>
            </Collapsible>
          )}

          {/* Target Topics */}
          {hasTopics && (
            <div className="space-y-3">
              <Label className="text-sm font-medium">Target Topics</Label>
              <RadioGroup
                value={targetTopics}
                onValueChange={(value) => setTargetTopics(value as "all" | "selected")}
                className="flex items-center gap-6"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="all" id="all-topics" />
                  <Label htmlFor="all-topics" className="cursor-pointer">
                    All Topics
                    <span className="text-xs text-muted-foreground ml-1">
                      ({availableTopics.length})
                    </span>
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="selected" id="selected-topics" />
                  <Label htmlFor="selected-topics" className="cursor-pointer">
                    Select Specific Topics
                    {targetTopics === "selected" && selectedTopics.size > 0 && (
                      <span className="text-xs text-muted-foreground ml-1">
                        ({selectedTopics.size})
                      </span>
                    )}
                  </Label>
                </div>
              </RadioGroup>

              {/* Topic selection - only shown when "Select Specific Topics" is chosen */}
              {targetTopics === "selected" && (
                <div className="space-y-3">
                  {/* Selected topics as badges */}
                  {selectedTopics.size > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {Array.from(selectedTopics).map((topicName) => (
                        <span
                          key={topicName}
                          className={`inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full ${getTopicColor(topicName)}`}
                        >
                          {topicName}
                          <button
                            type="button"
                            onClick={() => handleTopicToggle(topicName)}
                            className="hover:opacity-70 ml-0.5"
                          >
                            <span className="sr-only">Remove {topicName}</span>
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Dropdown to add topics */}
                  {availableTopics.filter((t) => !selectedTopics.has(t.name)).length > 0 && (
                    <Select
                      value=""
                      onValueChange={(value) => {
                        if (value) handleTopicToggle(value);
                      }}
                    >
                      <SelectTrigger className="w-[180px] h-8 text-xs bg-muted/30 border-border/50">
                        <SelectValue placeholder="+ Add topic" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableTopics
                          .filter((t) => !selectedTopics.has(t.name))
                          .map((topic) => (
                            <SelectItem key={topic.name} value={topic.name} className="text-xs">
                              <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium ${getTopicColor(topic.name)}`}>
                                {topic.name}
                              </span>
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Records per Topic & Model Selection */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Records per Topic</Label>
              <Input
                type="number"
                value={recordsPerTopic}
                onChange={(e) => setRecordsPerTopic(Math.max(1, parseInt(e.target.value) || 1))}
                min={1}
                max={50}
                className="bg-muted/30 border-border/50"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Select Model</Label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger className="bg-muted/30 border-border/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MODELS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Diversity Level */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label className="text-sm font-medium">Diversity Level</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs">
                      <p>Controls the variety and creativity of generated data. Higher values produce more diverse but potentially less consistent results.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <span className="text-sm font-medium px-2.5 py-0.5 rounded-full bg-[rgb(var(--theme-500))]/10 text-[rgb(var(--theme-500))]">
                {getDiversityLabel(diversityLevel)}
              </span>
            </div>
            <Slider
              value={[diversityLevel]}
              onValueChange={([value]) => setDiversityLevel(value)}
              min={0}
              max={100}
              step={1}
              className="[&_[role=slider]]:bg-[rgb(var(--theme-500))] [&_[role=slider]]:border-[rgb(var(--theme-500))] [&_.bg-primary]:bg-[rgb(var(--theme-500))]"
            />
            <div className="flex justify-between text-xs text-muted-foreground uppercase tracking-wider">
              <span>Standard</span>
              <span>Highly Creative</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={isGenerating}
          >
            Cancel
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={!canGenerate || isGenerating}
            className="bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white gap-2"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4" />
                Start Generation
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
