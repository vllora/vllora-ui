/**
 * ObjectiveInputTab
 *
 * Tab content for entering a dataset objective manually.
 * Features a text input with sparkle icon, badges, and start button.
 * Includes suggestion pills that show short summaries and fill full descriptions.
 * Also includes a "Try Sample" button to load pre-built sample datasets.
 * Now supports file uploads for knowledge sources.
 */

import { useState, useCallback } from "react";
import { Sparkles, ArrowRight, Loader2, FlaskConical, Upload, X, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  OBJECTIVE_SUGGESTIONS,
  type ObjectiveSuggestion,
} from "../constants/objective-suggestions";

interface ObjectiveInputTabProps {
  objective: string;
  onObjectiveChange: (value: string) => void;
  onStartFinetune: (files?: File[]) => void;
  onLoadSample?: () => void;
  isLoading?: boolean;
  isLoadingSample?: boolean;
}

export function ObjectiveInputTab({
  objective,
  onObjectiveChange,
  onStartFinetune,
  onLoadSample,
  isLoading = false,
  isLoadingSample = false,
}: ObjectiveInputTabProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleSuggestionClick = (suggestion: ObjectiveSuggestion) => {
    onObjectiveChange(suggestion.description);
  };

  const hasContent = objective.trim().length > 0;

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files).filter(
      (f) => f.type === "application/pdf" || f.type === "text/plain" || f.name.endsWith(".md")
    );
    if (droppedFiles.length > 0) {
      setFiles((prev) => [...prev, ...droppedFiles]);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length > 0) {
      setFiles((prev) => [...prev, ...selectedFiles]);
    }
    e.target.value = "";
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleStart = useCallback(() => {
    onStartFinetune(files.length > 0 ? files : undefined);
  }, [onStartFinetune, files]);

  return (
    <div className="w-full space-y-6">
      {/* Main Card with gradient border effect */}
      <div
        className={`group relative rounded-2xl p-[1px] bg-gradient-to-b from-border/80 via-border/40 to-border/80 hover:from-[rgba(var(--theme-500),0.3)] hover:via-border/40 hover:to-[rgba(var(--theme-500),0.3)] transition-all duration-500 ${isDragOver ? "from-[rgba(var(--theme-500),0.5)] via-[rgba(var(--theme-500),0.3)] to-[rgba(var(--theme-500),0.5)]" : ""}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
      >
        <div className="rounded-2xl bg-card/95 backdrop-blur-md overflow-hidden">
          {/* Input Area */}
          <div className="relative">
            {/* Sparkle Icon with subtle animation */}
            <div className="absolute left-5 top-5">
              <div className="relative">
                <Sparkles className="w-5 h-5 text-[rgba(var(--theme-500),0.9)] transition-transform duration-300 group-hover:scale-110" />
                <div className="absolute inset-0 text-[rgba(var(--theme-500),0.4)] animate-pulse">
                  <Sparkles className="w-5 h-5" />
                </div>
              </div>
            </div>

            <textarea
              value={objective}
              onChange={(e) => onObjectiveChange(e.target.value)}
              placeholder="Describe what you want your model to do..."
              className="w-full min-h-[28vh] bg-transparent border-0 border-none outline-none pl-14 pr-6 pt-5 pb-6 text-foreground placeholder:text-muted-foreground/60 resize-none focus:outline-none focus:ring-0 focus:border-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none text-[15px] leading-relaxed"
            />

            {/* Drag overlay */}
            {isDragOver && (
              <div className="absolute inset-0 bg-[rgba(var(--theme-500),0.1)] flex items-center justify-center pointer-events-none">
                <div className="flex items-center gap-2 text-[rgb(var(--theme-500))] font-medium">
                  <Upload className="w-5 h-5" />
                  Drop files here
                </div>
              </div>
            )}

            {/* Subtle gradient overlay at bottom for depth */}
            <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-card/80 to-transparent pointer-events-none" />
          </div>

          {/* File upload area - shown below textarea */}
          {files.length > 0 && (
            <div className="px-5 py-3 border-t border-border/30 bg-muted/10">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground">Knowledge sources:</span>
                {files.map((file, index) => (
                  <div
                    key={`${file.name}-${index}`}
                    className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-[rgba(var(--theme-500),0.1)] border border-[rgba(var(--theme-500),0.2)] text-xs"
                  >
                    <FileText className="w-3 h-3 text-[rgb(var(--theme-500))]" />
                    <span className="max-w-[150px] truncate">{file.name}</span>
                    <button
                      onClick={() => removeFile(index)}
                      className="ml-1 text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-4 border-t border-border/30 bg-muted/20">
            {/* Left side: file upload button + hint */}
            <div className="flex items-center gap-3">
              <label className="cursor-pointer">
                <input
                  type="file"
                  multiple
                  accept=".pdf,.txt,.md"
                  onChange={handleFileInput}
                  className="hidden"
                />
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                  <Upload className="w-3.5 h-3.5" />
                  Add docs
                </span>
              </label>
              <span className="text-xs text-muted-foreground/40">|</span>
              <span className="text-xs text-muted-foreground/60">
                {hasContent ? (
                  <span className="text-muted-foreground/80">
                    {objective.length} characters
                  </span>
                ) : (
                  "Be specific about capabilities and use cases"
                )}
              </span>
            </div>

            <Button
              onClick={handleStart}
              disabled={!hasContent || isLoading}
              className="group/btn relative bg-[rgba(var(--theme-500),1)] hover:bg-[rgba(var(--theme-400),1)] text-white gap-2 px-5 h-10 rounded-lg font-medium shadow-lg shadow-[rgba(var(--theme-500),0.25)] hover:shadow-[rgba(var(--theme-500),0.35)] hover:shadow-xl transition-all duration-200 disabled:opacity-40 disabled:shadow-none disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  Start Finetune
                  <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover/btn:translate-x-0.5" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Objective Suggestions */}
      <div className="flex items-center gap-2.5 flex-wrap justify-center">
        <span className="text-sm text-muted-foreground/70 mr-1">Try:</span>
        {OBJECTIVE_SUGGESTIONS.map((suggestion, index) => (
          <button
            key={suggestion.summary}
            onClick={() => handleSuggestionClick(suggestion)}
            className="group/pill px-4 py-2 text-sm rounded-full border border-border/50 bg-card/50 backdrop-blur-sm hover:bg-[rgba(var(--theme-500),0.08)] hover:border-[rgba(var(--theme-500),0.25)] hover:shadow-[0_0_20px_rgba(var(--theme-500),0.12)] transition-all duration-300 text-muted-foreground hover:text-foreground"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <span className="relative">
              {suggestion.summary}
              <span className="absolute inset-x-0 -bottom-px h-px bg-gradient-to-r from-transparent via-[rgba(var(--theme-500),0.5)] to-transparent opacity-0 group-hover/pill:opacity-100 transition-opacity duration-300" />
            </span>
          </button>
        ))}
      </div>

      {/* Sample Dataset CTA */}
      {onLoadSample && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <div className="h-px w-12" />
          <button
            onClick={onLoadSample}
            disabled={isLoadingSample}
            className="group/sample flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoadingSample ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-[rgb(var(--theme-500))]" />
                <span>Loading sample...</span>
              </>
            ) : (
              <>
                <span>or jumpstart with</span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[rgba(var(--theme-500),0.3)] bg-[rgba(var(--theme-500),0.08)] text-[rgb(var(--theme-500))] font-medium group-hover/sample:bg-[rgba(var(--theme-500),0.15)] group-hover/sample:border-[rgba(var(--theme-500),0.5)] transition-all">
                  <FlaskConical className="w-3.5 h-3.5" />
                  Chess Tutor Sample
                </span>
              </>
            )}
          </button>
          <div className="h-px w-12 bg-gradient-to-l from-transparent to-border/50" />
        </div>
      )}
    </div>
  );
}
