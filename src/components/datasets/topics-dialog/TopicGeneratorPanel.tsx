/**
 * TopicGeneratorPanel
 *
 * Right panel of TopicHierarchyDialog with Smart Topic Generator controls.
 */

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Sparkles, Loader2, Check, ChevronRight, RefreshCw } from "lucide-react";
import { type AutoTagProgress } from "../AutoTagButton";

export interface TopicGeneratorPanelProps {
  goals: string;
  onGoalsChange: (goals: string) => void;
  depth: number;
  onDepthChange: (depth: number) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  onAutoTag?: () => Promise<void>;
  isAutoTagging: boolean;
  autoTagProgress?: AutoTagProgress | null;
  onRecategorizeAll: () => void;
  nodeCount: number;
  recordCount: number;
  unlabeledPercent: number;
  hierarchyLength: number;
  saveStatus: "idle" | "saving" | "saved";
}

export function TopicGeneratorPanel({
  goals,
  onGoalsChange,
  depth,
  onDepthChange,
  onGenerate,
  isGenerating,
  onAutoTag,
  isAutoTagging,
  autoTagProgress,
  onRecategorizeAll,
  nodeCount,
  recordCount,
  unlabeledPercent,
  hierarchyLength,
  saveStatus,
}: TopicGeneratorPanelProps) {
  return (
    <div className="w-1/2 flex flex-col overflow-y-auto bg-muted/5">
      <div className="p-6 space-y-5">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
            <Sparkles className="w-4 h-4 text-emerald-500" />
          </div>
          <div>
            <h2 className="text-base font-semibold">Smart Topic Generator</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Describe how you want to organize your dataset. The AI will analyze your LLM traces and propose a hierarchical structure.
            </p>
          </div>
        </div>

        {/* Agent Instructions */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Agent Instructions
          </label>
          <Textarea
            value={goals}
            onChange={(e) => onGoalsChange(e.target.value)}
            placeholder="e.g. Group these by chess strategy and openings. Create a nested structure for beginner vs advanced tactics based on Elo rating tags."
            className="min-h-[120px] resize-none bg-muted/30 border-border/50 text-sm"
          />
        </div>

        {/* Parameters */}
        <div className="space-y-3">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Parameters
          </label>
          <div className="p-4 rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-muted-foreground">MAX DEPTH</span>
              <span className="text-xs font-medium px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500">
                Level {depth}
              </span>
            </div>
            <Slider
              value={[depth]}
              onValueChange={([value]) => onDepthChange(value)}
              min={1}
              max={5}
              step={1}
              className="[&_[role=slider]]:bg-emerald-500 [&_[role=slider]]:border-emerald-500 [&_.bg-primary]:bg-emerald-500"
            />
            <div className="flex justify-between text-xs text-muted-foreground mt-2">
              <span>1</span>
              <span>2</span>
              <span>3</span>
              <span>4</span>
              <span>5</span>
            </div>
          </div>
        </div>

        {/* Generate button */}
        <Button
          onClick={onGenerate}
          disabled={isGenerating}
          className="w-full h-10 bg-emerald-500 hover:bg-emerald-600 text-white gap-2 text-sm font-medium"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              GENERATE WITH AI
            </>
          )}
        </Button>

        {/* Categorize Records section */}
        <div className="space-y-2 pt-1">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Categorize Records
          </label>

          {/* Apply to Unlabeled Records */}
          <button
            onClick={onAutoTag}
            disabled={hierarchyLength === 0 || recordCount === 0 || isAutoTagging || unlabeledPercent === 0}
            className="w-full p-3 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed group"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-sm">Apply to Unlabeled Records</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {isAutoTagging && autoTagProgress ? (
                    `Processing ${autoTagProgress.completed}/${autoTagProgress.total}...`
                  ) : (
                    `Map the remaining ${unlabeledPercent}% of unlabeled records to the new hierarchy structure.`
                  )}
                </div>
              </div>
              {isAutoTagging ? (
                <Loader2 className="w-4 h-4 text-muted-foreground animate-spin flex-shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
              )}
            </div>
          </button>

          {/* Recategorize All Current Records */}
          <button
            onClick={onRecategorizeAll}
            disabled={hierarchyLength === 0 || recordCount === 0 || isAutoTagging}
            className="w-full p-3 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed group"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-sm">Recategorize All Current Records</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Reset and re-assign all dataset records based on the updated categories and AI logic.
                </div>
              </div>
              <RefreshCw className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0" />
            </div>
          </button>
        </div>

        {/* Status indicators */}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
          <span>
            {nodeCount} topic{nodeCount !== 1 ? "s" : ""} {recordCount > 0 && `· ${recordCount} records`}
          </span>
          {saveStatus !== "idle" && (
            <span className="flex items-center gap-1.5">
              {saveStatus === "saving" ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check className="w-3 h-3 text-green-500" />
                  Saved
                </>
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
