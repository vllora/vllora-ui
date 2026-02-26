/**
 * ObjectiveInputTab
 *
 * Landing page tab for entering a dataset objective.
 * Claude Code-style input with file attach, voice input, and quick suggestions.
 */

import { useCallback, useState, useRef, useEffect } from "react";
import { Sparkles, Loader2, Paperclip, Mic, Crown, BarChart3, Code2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  OBJECTIVE_SUGGESTIONS,
  type ObjectiveSuggestion,
} from "../constants/objective-suggestions";
import { useKnowledgeSourcesUpload, DragOverlay, FileList } from "./KnowledgeSourcesUpload";

// Map suggestion summaries to icons for visual richness
const SUGGESTION_ICONS: Record<string, typeof Sparkles> = {
  "Chess Tutor Assistant": Crown,
  "Financial Report Summarizer": BarChart3,
  "Code Generation Assistant": Code2,
};

interface ObjectiveInputTabProps {
  objective: string;
  onObjectiveChange: (value: string) => void;
  onStartFinetune: (files?: File[]) => void;
  isLoading?: boolean;
}

export function ObjectiveInputTab({
  objective,
  onObjectiveChange,
  onStartFinetune,
  isLoading = false,
}: ObjectiveInputTabProps) {
  const {
    files,
    handleDrop: hookHandleDrop,
    handleFileInput,
    removeFile,
  } = useKnowledgeSourcesUpload();

  const [isFocused, setIsFocused] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Robust drag-and-drop with counter to prevent flicker on child elements
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (dragCounterRef.current === 1) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragOver(false);
    hookHandleDrop(e);
  }, [hookHandleDrop]);

  // Voice input state
  const [isListening, setIsListening] = useState(false);
  const [isSpeechSupported, setIsSpeechSupported] = useState(false);
  const recognitionRef = useRef<ReturnType<typeof Object> | null>(null);
  const objectiveRef = useRef(objective);

  // Keep objectiveRef in sync so voice callback always has latest value
  useEffect(() => {
    objectiveRef.current = objective;
  }, [objective]);

  // Check speech recognition support on mount
  useEffect(() => {
    setIsSpeechSupported(
      typeof window !== "undefined" &&
        ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)
    );
  }, []);

  // Cleanup recognition on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        (recognitionRef.current as { stop: () => void }).stop();
      }
    };
  }, []);

  const toggleVoiceInput = useCallback(() => {
    if (isListening) {
      // Stop listening
      if (recognitionRef.current) {
        (recognitionRef.current as { stop: () => void }).stop();
        recognitionRef.current = null;
      }
      setIsListening(false);
      return;
    }

    // Start listening
    if (
      !("webkitSpeechRecognition" in window || "SpeechRecognition" in window)
    )
      return;

    const SpeechRecognitionAPI =
      (window as /* eslint-disable-line @typescript-eslint/no-explicit-any */ any)
        .SpeechRecognition ||
      (window as /* eslint-disable-line @typescript-eslint/no-explicit-any */ any)
        .webkitSpeechRecognition;
    const recognition = new SpeechRecognitionAPI();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.continuous = true;

    recognition.onresult = (event: { resultIndex: number; results: { length: number; [key: number]: { isFinal: boolean; 0: { transcript: string } } } }) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          transcript += event.results[i][0].transcript;
        }
      }
      if (transcript) {
        const current = objectiveRef.current;
        onObjectiveChange(
          current ? current + " " + transcript.trim() : transcript.trim()
        );
      }
    };

    recognition.onerror = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening, onObjectiveChange]);

  const handleSuggestionClick = (suggestion: ObjectiveSuggestion) => {
    onObjectiveChange(suggestion.description);
  };

  const hasContent = objective.trim().length > 0;

  const handleStart = useCallback(() => {
    onStartFinetune(files.length > 0 ? files : undefined);
  }, [onStartFinetune, files]);

  return (
    <div className="w-full space-y-6">
      {/* Main Input Card — drag-and-drop enabled, glowing border */}
      <div
        className="group relative"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Glow effect behind card */}
        <div
          className={`absolute -inset-px rounded-2xl transition-opacity duration-500 ${
            isFocused || isDragOver
              ? "opacity-100"
              : "opacity-0 group-hover:opacity-60"
          }`}
          style={{
            background:
              "linear-gradient(135deg, rgba(var(--theme-500), 0.2), rgba(var(--theme-400), 0.05), rgba(var(--theme-500), 0.15))",
          }}
        />

        {/* Outer glow spread */}
        <div
          className={`absolute -inset-3 rounded-3xl blur-xl transition-opacity duration-700 pointer-events-none ${
            isFocused ? "opacity-100" : "opacity-0"
          }`}
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(var(--theme-500), 0.06), transparent 70%)",
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
            <div
              className={`absolute left-4 top-[18px] transition-all duration-300 ${isFocused ? "opacity-80 scale-100" : "opacity-40 scale-95"}`}
            >
              <Sparkles className="w-4 h-4 text-[rgb(var(--theme-500))]" />
            </div>

            <textarea
              value={objective}
              onChange={(e) => onObjectiveChange(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder="Describe what you want your model to do... e.g. 'A specialized assistant for React performance optimization that speaks in a concise, technical tone.'"
              className="w-full min-h-[180px] bg-transparent border-0 border-none outline-none pl-11 pr-6 pt-[18px] pb-5 text-[14px] text-foreground placeholder:text-muted-foreground/30 resize-none focus:outline-none focus:ring-0 focus:border-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none leading-[1.7]"
            />
          </div>

          {/* File list (inside card when files are attached) */}
          <FileList files={files} onRemove={removeFile} />

          {/* Footer bar — attach + voice on left, start on right */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-border/20 bg-muted/10">
            <div className="flex items-center gap-1">
              {/* Attach files button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center h-8 w-8 rounded-lg hover:bg-accent/50 transition-colors"
                title="Attach reference documents (PDFs, text files)"
              >
                <Paperclip className="h-4 w-4 text-muted-foreground" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.txt,.md"
                onChange={handleFileInput}
                className="hidden"
              />

              {/* Voice input button */}
              {isSpeechSupported && (
                <button
                  type="button"
                  onClick={toggleVoiceInput}
                  className={`flex items-center justify-center h-8 w-8 rounded-lg transition-colors ${
                    isListening
                      ? "bg-red-500/10 hover:bg-red-500/20"
                      : "hover:bg-accent/50"
                  }`}
                  title={isListening ? "Stop voice input" : "Voice input"}
                >
                  <Mic
                    className={`h-4 w-4 transition-colors ${isListening ? "text-red-500 animate-pulse" : "text-muted-foreground"}`}
                  />
                </button>
              )}
            </div>

            {/* Listening indicator */}
            {isListening && (
              <div className="flex items-center gap-2 text-xs text-red-400 animate-pulse">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                Listening...
              </div>
            )}

            {/* Start button */}
            <Button
              onClick={handleStart}
              disabled={!hasContent || isLoading}
              className="group/btn bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-400))] text-white gap-2 px-6 h-10 rounded-xl text-[13px] font-semibold shadow-md shadow-[rgba(var(--theme-500),0.25)] hover:shadow-lg hover:shadow-[rgba(var(--theme-500),0.3)] transition-all duration-200 disabled:opacity-25 disabled:shadow-none disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  Start Finetune
                  <Sparkles className="w-3.5 h-3.5 transition-transform duration-200 group-hover/btn:rotate-12" />
                </>
              )}
            </Button>
          </div>

          {/* Drag overlay */}
          {isDragOver && <DragOverlay />}
        </div>
      </div>

      {/* Quick-Start Suggestions */}
      <div className="space-y-3">
        <span className="text-[11px] font-semibold text-muted-foreground/40 tracking-widest uppercase">
          Quick-start suggestions
        </span>
        <div className="flex items-center gap-2.5 flex-wrap">
          {OBJECTIVE_SUGGESTIONS.map((suggestion) => {
            const Icon = SUGGESTION_ICONS[suggestion.summary] || Sparkles;
            return (
              <button
                key={suggestion.summary}
                onClick={() => handleSuggestionClick(suggestion)}
                className="group/chip flex items-center gap-2 px-4 py-2 rounded-full border border-[rgba(var(--theme-500),0.2)] bg-[rgba(var(--theme-500),0.04)] text-[rgba(var(--theme-500),0.8)] text-[12px] font-medium hover:bg-[rgba(var(--theme-500),0.1)] hover:border-[rgba(var(--theme-500),0.35)] hover:text-[rgb(var(--theme-500))] transition-all duration-300"
              >
                <Icon className="w-3.5 h-3.5" />
                {suggestion.summary}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
