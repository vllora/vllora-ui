/**
 * ObjectiveInputCard
 *
 * Shared Claude Code-style input card with glowing border, file attach,
 * voice input, and drag-and-drop. Used by both ObjectiveInputTab and ApiInitializeTab.
 */

import { useState, useCallback, useRef, forwardRef, useImperativeHandle } from "react";
import { Sparkles, Paperclip, Mic } from "lucide-react";
import { useKnowledgeSourcesUpload, DragOverlay, FileList } from "./KnowledgeSourcesUpload";
import { useVoiceInput } from "./useVoiceInput";

export interface ObjectiveInputCardRef {
  files: File[];
}

interface ObjectiveInputCardProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** When true, card fills available height with flex layout */
  fillHeight?: boolean;
  /** Extra buttons rendered after the mic button in the footer left area */
  footerExtra?: React.ReactNode;
  /** Action button(s) rendered on the right side of the footer */
  actionButton?: React.ReactNode;
  /** Additional className for the outer wrapper */
  className?: string;
}

export const ObjectiveInputCard = forwardRef<ObjectiveInputCardRef, ObjectiveInputCardProps>(
  ({ value, onChange, placeholder, fillHeight, footerExtra, actionButton, className }, ref) => {
    const {
      files,
      handleDrop: hookHandleDrop,
      handleFileInput,
      removeFile,
    } = useKnowledgeSourcesUpload();

    const [isFocused, setIsFocused] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Counter-based drag-and-drop to prevent flicker on child elements
    const [isDragOver, setIsDragOver] = useState(false);
    const dragCounterRef = useRef(0);

    const handleDragEnter = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current++;
      if (dragCounterRef.current === 1) setIsDragOver(true);
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current--;
      if (dragCounterRef.current === 0) setIsDragOver(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setIsDragOver(false);
      hookHandleDrop(e);
    }, [hookHandleDrop]);

    // Voice input — shared hook
    const valueRef = useRef(value);
    valueRef.current = value;

    const { isListening, isSpeechSupported, toggleVoiceInput } = useVoiceInput({
      onTranscript: useCallback((text: string) => {
        const current = valueRef.current;
        onChange(current ? current + " " + text : text);
      }, [onChange]),
    });

    // Expose files to parent via ref
    useImperativeHandle(ref, () => ({ files }), [files]);

    return (
      <div
        className={`group relative ${className || ""}`}
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
            fillHeight ? "h-full flex flex-col" : ""
          } ${
            isDragOver
              ? "border-[rgba(var(--theme-500),0.4)]"
              : isFocused
                ? "border-[rgba(var(--theme-500),0.25)] shadow-lg shadow-[rgba(var(--theme-500),0.05)]"
                : "border-border/50 hover:border-border/80"
          }`}
          style={{ background: "hsl(var(--card) / 0.9)" }}
        >
          {/* Textarea area */}
          <div className={`relative ${fillHeight ? "flex-1" : ""}`}>
            {/* Sparkle watermark */}
            <div
              className={`absolute left-4 top-[18px] transition-all duration-300 ${
                isFocused ? "opacity-80 scale-100" : "opacity-40 scale-95"
              }`}
            >
              <Sparkles className="w-4 h-4 text-[rgb(var(--theme-500))]" />
            </div>

            <textarea
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder={placeholder || "Describe what you want your model to do..."}
              className={`w-full bg-transparent border-0 border-none outline-none pl-11 pr-6 pt-[18px] pb-5 text-[14px] text-foreground placeholder:text-muted-foreground/30 resize-none focus:outline-none focus:ring-0 focus:border-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none leading-[1.7] ${
                fillHeight ? "h-full" : "min-h-[180px]"
              }`}
            />
          </div>

          {/* Drag overlay */}
          {isDragOver && <DragOverlay />}

          {/* File list */}
          <FileList files={files} onRemove={removeFile} className={fillHeight ? "shrink-0" : undefined} />

          {/* Footer bar */}
          <div className={`flex items-center justify-between px-4 py-3 border-t border-border/20 bg-muted/10 ${fillHeight ? "shrink-0" : ""}`}>
            <div className="flex items-center gap-1">
              {/* Attach files */}
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

              {/* Voice input */}
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
                    className={`h-4 w-4 transition-colors ${
                      isListening ? "text-red-500 animate-pulse" : "text-muted-foreground"
                    }`}
                  />
                </button>
              )}

              {/* Extra footer content (e.g. Suggest button) */}
              {footerExtra}
            </div>

            {/* Listening indicator */}
            {isListening && (
              <div className="flex items-center gap-2 text-xs text-red-400 animate-pulse">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                Listening...
              </div>
            )}

            {/* Action button */}
            {actionButton}
          </div>
        </div>
      </div>
    );
  }
);

ObjectiveInputCard.displayName = "ObjectiveInputCard";
