/**
 * ObjectiveInputTab
 *
 * Tab content for entering a dataset objective manually.
 * Features a text input with sparkle icon, badges, and start button.
 * Includes suggestion pills that show short summaries and fill full descriptions.
 */

import { Sparkles, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  OBJECTIVE_SUGGESTIONS,
  type ObjectiveSuggestion,
} from "../constants/objective-suggestions";

interface ObjectiveInputTabProps {
  objective: string;
  onObjectiveChange: (value: string) => void;
  onStartFinetune: () => void;
  isLoading?: boolean;
}

export function ObjectiveInputTab({
  objective,
  onObjectiveChange,
  onStartFinetune,
  isLoading = false,
}: ObjectiveInputTabProps) {
  const handleSuggestionClick = (suggestion: ObjectiveSuggestion) => {
    onObjectiveChange(suggestion.description);
  };

  return (
    <div className="w-full space-y-6">
      <div className="rounded-xl border border-border bg-card/50 backdrop-blur-sm p-1">
        {/* Input Area */}
        <div className="relative">
          <div className="absolute left-4 top-4">
            <Sparkles className="w-5 h-5 text-[rgb(var(--theme-500))]" />
          </div>
          <textarea
            value={objective}
            onChange={(e) => onObjectiveChange(e.target.value)}
            placeholder="e.g., Train a model to explain complex legal documents in simple terms to non-experts..."
            className="w-full min-h-[120px] bg-transparent border-0 pl-12 pr-4 pt-4 pb-4 text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-0 text-base"
          />
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-4 py-3 border-t border-border/50">
          <Button
            onClick={onStartFinetune}
            disabled={!objective.trim() || isLoading}
            className="bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                Start Finetune
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Objective Suggestions */}
      <div className="flex items-center gap-3 flex-wrap justify-center">
        <span className="text-sm text-muted-foreground">Try:</span>
        {OBJECTIVE_SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion.summary}
            onClick={() => handleSuggestionClick(suggestion)}
            className="px-3 py-1.5 text-sm rounded-full border border-border hover:border-[rgb(var(--theme-500))]/50 hover:bg-muted/50 transition-colors text-muted-foreground hover:text-foreground"
          >
            {suggestion.summary}
          </button>
        ))}
      </div>
    </div>
  );
}
