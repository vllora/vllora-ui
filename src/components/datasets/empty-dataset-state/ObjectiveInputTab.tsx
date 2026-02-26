/**
 * ObjectiveInputTab
 *
 * Landing page tab for entering a dataset objective.
 * Features a glowing input card, animated suggestions, and file upload.
 */

import { useCallback, useState } from "react";
import { Sparkles, ArrowRight, Loader2, FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  OBJECTIVE_SUGGESTIONS,
  type ObjectiveSuggestion,
} from "../constants/objective-suggestions";
import { useKnowledgeSourcesUpload, DragOverlay, FileList, AddDocsButton } from "./KnowledgeSourcesUpload";

interface ObjectiveInputTabProps {
  objective: string;
  onObjectiveChange: (value: string) => void;
  datasetName?: string;
  onDatasetNameChange?: (value: string) => void;
  onStartFinetune: (files?: File[]) => void;
  onLoadSample?: () => void;
  isLoading?: boolean;
  isLoadingSample?: boolean;
}

export function ObjectiveInputTab({
  objective,
  onObjectiveChange,
  datasetName = "",
  onDatasetNameChange,
  onStartFinetune,
  onLoadSample,
  isLoading = false,
  isLoadingSample = false,
}: ObjectiveInputTabProps) {
  const {
    files,
    isDragOver,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    handleFileInput,
    removeFile,
  } = useKnowledgeSourcesUpload();

  const [isFocused, setIsFocused] = useState(false);

  const handleSuggestionClick = (suggestion: ObjectiveSuggestion) => {
    onObjectiveChange(suggestion.description);
  };

  const hasContent = objective.trim().length > 0;

  const handleStart = useCallback(() => {
    onStartFinetune(files.length > 0 ? files : undefined);
  }, [onStartFinetune, files]);

  return (
    <div className="w-full space-y-6">
      {/* Main Input Card — glowing border on focus */}
      <div
        className="group relative"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        {/* Glow effect behind card */}
        <div
          className={`absolute -inset-px rounded-2xl transition-opacity duration-500 ${
            isFocused || isDragOver
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-60"
          }`}
          style={{
            background: "linear-gradient(135deg, rgba(var(--theme-500), 0.2), rgba(var(--theme-400), 0.05), rgba(var(--theme-500), 0.15))",
          }}
        />

        {/* Outer glow spread */}
        <div
          className={`absolute -inset-3 rounded-3xl blur-xl transition-opacity duration-700 pointer-events-none ${
            isFocused ? "opacity-100" : "opacity-0"
          }`}
          style={{
            background: "radial-gradient(ellipse at center, rgba(var(--theme-500), 0.06), transparent 70%)",
          }}
        />

        <div
          className={`relative rounded-2xl border transition-all duration-300 overflow-hidden ${
            isDragOver
              ? "border-[rgba(var(--theme-500),0.4)]"
              : isFocused
              ? "border-[rgba(var(--theme-500),0.25)] shadow-lg shadow-[rgba(var(--theme-500),0.05)]"
              : "border-border/50 hover:border-border/80"
          }`}
          style={{ background: "hsl(var(--card) / 0.9)" }}
        >
          {/* Textarea area */}
          <div className="relative">
            {/* Sparkle watermark */}
            <div className={`absolute left-4 top-[18px] transition-all duration-300 ${isFocused ? "opacity-80 scale-100" : "opacity-40 scale-95"}`}>
              <Sparkles className="w-4 h-4 text-[rgb(var(--theme-500))]" />
            </div>

            <textarea
              value={objective}
              onChange={(e) => onObjectiveChange(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder="e.g. A chess tutor that analyzes board positions and explains optimal moves at any skill level..."
              className="w-full min-h-[200px] bg-transparent border-0 border-none outline-none pl-11 pr-6 pt-[18px] pb-5 text-[14px] text-foreground placeholder:text-muted-foreground/30 resize-none focus:outline-none focus:ring-0 focus:border-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none leading-[1.7]"
            />
          </div>

          {/* Drag overlay */}
          {isDragOver && <DragOverlay />}

          {/* File list */}
          <FileList files={files} onRemove={removeFile} />

          {/* Footer bar */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-border/20 bg-muted/10">
            {/* Left side */}
            <div className="flex items-center gap-3">
              <AddDocsButton onFileInput={handleFileInput} />
              {hasContent && (
                <span className="text-[11px] text-muted-foreground/30 tabular-nums">
                  {objective.length} chars
                </span>
              )}
            </div>

            {/* Right side */}
            <div className="flex items-center gap-2.5">
              {/* Name field — slides in when objective has content */}
              {hasContent && onDatasetNameChange && (
                <div className="animate-in fade-in slide-in-from-right-2 duration-300">
                  <input
                    type="text"
                    value={datasetName}
                    onChange={(e) => onDatasetNameChange(e.target.value)}
                    placeholder="Experiment name"
                    className="h-8 w-48 px-2.5 text-[12px] bg-background/40 border border-border/30 rounded-lg outline-none focus:border-[rgba(var(--theme-500),0.3)] transition-colors placeholder:text-muted-foreground/25"
                  />
                </div>
              )}

              <Button
                onClick={handleStart}
                disabled={!hasContent || isLoading}
                className="group/btn bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-400))] text-white gap-1.5 px-5 h-9 rounded-xl text-[13px] font-semibold shadow-md shadow-[rgba(var(--theme-500),0.25)] hover:shadow-lg hover:shadow-[rgba(var(--theme-500),0.3)] transition-all duration-200 disabled:opacity-25 disabled:shadow-none disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    Start Finetune
                    <ArrowRight className="w-3.5 h-3.5 transition-transform duration-200 group-hover/btn:translate-x-0.5" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Suggestion Chips */}
      <div className="flex items-center gap-2.5 flex-wrap justify-center pt-1">
        <span className="text-[12px] text-muted-foreground/40 font-medium tracking-wide">
          Try:
        </span>
        {OBJECTIVE_SUGGESTIONS.map((suggestion, index) => (
          <button
            key={suggestion.summary}
            onClick={() => handleSuggestionClick(suggestion)}
            className="group/chip relative px-3.5 py-1.5 text-[12px] rounded-full border border-border/30 bg-card/30 backdrop-blur-sm hover:bg-[rgba(var(--theme-500),0.06)] hover:border-[rgba(var(--theme-500),0.2)] transition-all duration-300 text-muted-foreground/60 hover:text-foreground"
            style={{ animationDelay: `${index * 80}ms` }}
          >
            {suggestion.summary}
          </button>
        ))}
      </div>

      {/* Sample Dataset Link */}
      {onLoadSample && (
        <div className="flex items-center justify-center pt-2">
          <button
            onClick={onLoadSample}
            disabled={isLoadingSample}
            className="group/sample flex items-center gap-1.5 text-[12px] text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoadingSample ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[rgb(var(--theme-500))]" />
                <span>Loading sample...</span>
              </>
            ) : (
              <>
                <span>or start with</span>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-[rgba(var(--theme-500),0.15)] bg-[rgba(var(--theme-500),0.04)] text-[rgba(var(--theme-500),0.7)] font-medium group-hover/sample:bg-[rgba(var(--theme-500),0.08)] group-hover/sample:border-[rgba(var(--theme-500),0.3)] group-hover/sample:text-[rgba(var(--theme-500),0.9)] transition-all duration-300">
                  <FlaskConical className="w-3 h-3" />
                  Chess Tutor Sample
                </span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
