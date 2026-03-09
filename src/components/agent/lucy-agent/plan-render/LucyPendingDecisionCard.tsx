/**
 * LucyPendingDecisionCard
 *
 * Shown in the sidebar when the user returns to a dataset that has
 * pending iteration proposals (phase === 'awaiting_user').
 * Re-presents the proposed changes with action buttons.
 */

import { useState } from 'react';
import {
  AlertCircle,
  Check,
  Pencil,
  RefreshCw,
  RotateCcw,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { emitter } from '@/utils/eventEmitter';
import type { ProposedChange } from '@/services/finetune-iteration-db';

// =============================================================================
// Types
// =============================================================================

interface PendingDecisionCardProps {
  readonly iterationNumber: number;
  readonly proposedChanges: readonly ProposedChange[];
  readonly lastScore?: number;
}

// =============================================================================
// Constants
// =============================================================================

const LEVER_ICONS: Record<string, string> = {
  grader: '⚖️',
  records: '📝',
  distribution: '📊',
  training_config: '⚙️',
  topics: '🗂️',
};

const DECISION_PROMPTS = {
  accept: 'I accept the proposed changes from the previous iteration. Please apply them now.',
  modify: 'I want to modify the proposed changes before applying. Let me tell you what adjustments I need.',
  reanalyze: 'Please re-analyze the current evaluation results — I want a fresh perspective before deciding.',
  startFresh: 'Let\'s start fresh. Discard the proposed changes and re-evaluate from scratch.',
} as const;

function sendPrompt(prompt: string) {
  emitter.emit('vllora_lucy_prompt', { prompt });
}

// =============================================================================
// Component
// =============================================================================

export function LucyPendingDecisionCard({
  iterationNumber,
  proposedChanges,
  lastScore,
}: PendingDecisionCardProps) {
  const [clicked, setClicked] = useState<string | null>(null);

  const handleClick = (action: string, prompt: string) => {
    setClicked(action);
    sendPrompt(prompt);
  };

  return (
    <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-900/10 p-3 space-y-2.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
          <span className="text-xs font-semibold text-foreground">Pending Decision</span>
        </div>
        <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
          Iteration {iterationNumber}
        </span>
      </div>

      {/* Score context */}
      {lastScore != null && (
        <div className="text-[11px] text-muted-foreground">
          Last eval score: {lastScore.toFixed(2)}
        </div>
      )}

      {/* Proposed changes */}
      {proposedChanges.length > 0 && (
        <div className="space-y-0.5">
          <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
            Proposed Changes
          </div>
          {proposedChanges.map((change, i) => (
            <div key={i} className="flex items-start gap-1.5 text-[11px]">
              <span className="shrink-0">{LEVER_ICONS[change.lever] ?? '🔧'}</span>
              <span className="text-foreground">{change.description}</span>
              {change.applied && (
                <Check className="w-3 h-3 text-emerald-500 shrink-0 mt-0.5" />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Action buttons */}
      {!clicked ? (
        <div className="grid grid-cols-2 gap-1.5 pt-0.5">
          <Button
            size="sm"
            className="h-6 text-[10px] gap-1 bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white"
            onClick={() => handleClick('accept', DECISION_PROMPTS.accept)}
          >
            <Check className="w-3 h-3" />
            Accept
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-[10px] gap-1"
            onClick={() => handleClick('modify', DECISION_PROMPTS.modify)}
          >
            <Pencil className="w-3 h-3" />
            Modify
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-[10px] gap-1"
            onClick={() => handleClick('reanalyze', DECISION_PROMPTS.reanalyze)}
          >
            <RefreshCw className="w-3 h-3" />
            Re-analyze
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-[10px] gap-1 text-muted-foreground"
            onClick={() => handleClick('fresh', DECISION_PROMPTS.startFresh)}
          >
            <RotateCcw className="w-3 h-3" />
            Start Fresh
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground pt-0.5">
          <Zap className="w-3 h-3 text-emerald-500" />
          <span>Response sent</span>
        </div>
      )}
    </div>
  );
}
