/**
 * RowDetailCard
 *
 * Expandable card showing evaluation details for a single training row.
 */

import { useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronDown, ChevronRight, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getScoreColorClass,
  getScoreBgClass,
  formatScore,
  type ScoreBreakdown,
} from "@/utils/parse-score-breakdown";
import { EpochScoresTable } from "./EpochScoresTable";
import { ConversationDialog } from "./ConversationDialog";
import { type Message } from "./utils";

export interface RowData {
  rowIndex: number;
  inputMessages: Message[];
  outputMessage: Message | null;
  epochs: {
    epoch: number;
    score: number;
    breakdown: ScoreBreakdown;
    logs?: string[];
  }[];
}

interface RowDetailCardProps {
  row: RowData;
  isExpanded: boolean;
  onToggle: () => void;
  criteriaNames: string[];
}

export function RowDetailCard({
  row,
  isExpanded,
  onToggle,
  criteriaNames,
}: RowDetailCardProps) {
  const [showConversation, setShowConversation] = useState(false);
  const latestEpoch = row.epochs[row.epochs.length - 1];
  const latestScore = latestEpoch?.score ?? 0;

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-muted/50 transition-colors"
        onClick={onToggle}
      >
        <div className="text-muted-foreground">
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </div>

        <span className="text-xs font-mono text-muted-foreground w-12">
          #{row.rowIndex}
        </span>

        <span className="text-xs flex-1 truncate" title={getPromptPreview(row.inputMessages)}>
          {getPromptPreview(row.inputMessages)}
        </span>

        <div className="flex items-center gap-2">
          {/* Mini epoch indicators */}
          <div className="flex gap-0.5">
            {row.epochs.map((e, idx) => (
              <div
                key={`${e.epoch}-${idx}`}
                className={cn(
                  "w-2 h-2 rounded-full",
                  e.score >= 0.8
                    ? "bg-green-500"
                    : e.score >= 0.6
                    ? "bg-yellow-500"
                    : "bg-red-500"
                )}
                title={`Epoch ${e.epoch}: ${formatScore(e.score)}`}
              />
            ))}
          </div>

          <span
            className={cn(
              "text-xs font-medium px-1.5 py-0.5 rounded",
              getScoreBgClass(latestScore),
              getScoreColorClass(latestScore)
            )}
          >
            {formatScore(latestScore)}
          </span>
        </div>
      </button>

      {isExpanded && (
        <div className="px-3 py-2 border-t bg-muted/20 space-y-3">
          {/* View Conversation Button */}
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={() => setShowConversation(true)}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            View Conversation
          </Button>

          {/* Epoch scores table */}
          <EpochScoresTable epochs={row.epochs} criteriaNames={criteriaNames} />
        </div>
      )}

      {/* Conversation Dialog */}
      <ConversationDialog
        open={showConversation}
        onOpenChange={setShowConversation}
        rowIndex={row.rowIndex}
        inputMessages={row.inputMessages}
        outputMessage={row.outputMessage}
      />
    </div>
  );
}

function getPromptPreview(inputMessages: Message[]): string {
  // Find the last user message for preview
  for (let i = inputMessages.length - 1; i >= 0; i--) {
    if (inputMessages[i].role === "user") {
      const content = inputMessages[i].content;
      return content.length > 80 ? content.slice(0, 80) + "..." : content;
    }
  }
  if (inputMessages[0]?.content) {
    const content = inputMessages[0].content;
    return content.length > 80 ? content.slice(0, 80) + "..." : content;
  }
  return "No prompt available";
}
