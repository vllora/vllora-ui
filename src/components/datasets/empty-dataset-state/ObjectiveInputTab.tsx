/**
 * ObjectiveInputTab
 *
 * Landing page tab for entering a dataset objective.
 * Claude Code-style input with file attach, voice input, and quick suggestions.
 */

import { useCallback, useRef } from "react";
import { Sparkles, Crown, BarChart3, Code2 } from "lucide-react";
import {
  OBJECTIVE_SUGGESTIONS,
  type ObjectiveSuggestion,
} from "../constants/objective-suggestions";
import { ObjectiveInputCard, type ObjectiveInputCardRef } from "./ObjectiveInputCard";
import { StartFinetuneButton } from "./StartFinetuneButton";

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
  const cardRef = useRef<ObjectiveInputCardRef>(null);

  const handleStart = useCallback(() => {
    const files = cardRef.current?.files;
    onStartFinetune(files && files.length > 0 ? files : undefined);
  }, [onStartFinetune]);

  const handleSuggestionClick = (suggestion: ObjectiveSuggestion) => {
    onObjectiveChange(suggestion.description);
  };

  const hasContent = objective.trim().length > 0;

  return (
    <div className="space-y-6">
      <div className="w-full max-w-[50vw] mx-auto">
        <ObjectiveInputCard
          ref={cardRef}
          value={objective}
          onChange={onObjectiveChange}
          placeholder="Describe what you want your model to do... e.g. 'A specialized assistant for React performance optimization that speaks in a concise, technical tone.'"
          actionButton={
            <StartFinetuneButton
              onClick={handleStart}
              disabled={!hasContent}
              isLoading={isLoading}
            />
          }
        />
      </div>

      {/* Ideas to get started */}
      <div className="space-y-3 flex flex-col items-center">
        <span className="text-[11px] font-semibold text-muted-foreground/40 tracking-widest uppercase">
          Ideas to get started
        </span>
        <div className="flex items-center gap-2.5 flex-wrap justify-center">
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
