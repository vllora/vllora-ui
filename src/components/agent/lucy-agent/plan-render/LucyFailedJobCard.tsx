/**
 * LucyFailedJobCard
 *
 * Shown in the sidebar when the user returns to a dataset where
 * an evaluation job has failed. Displays the error context with
 * recovery action buttons.
 */

import { useState } from 'react';
import {
  AlertTriangle,
  Check,
  Pencil,
  RefreshCw,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { emitter } from '@/utils/eventEmitter';

// =============================================================================
// Types
// =============================================================================

interface FailedJobCardProps {
  readonly jobId: string;
  readonly errorMessage?: string;
  readonly failedAt?: number;
}

// =============================================================================
// Constants
// =============================================================================

const RECOVERY_PROMPTS = {
  retry: 'Please retry the failed evaluation. Run it again with the same configuration.',
  fixGrader: 'The evaluation failed — it might be a grader issue. Please check the grader configuration and suggest fixes.',
  regenerate: 'I want to regenerate the training records that may have caused the failure, then retry the evaluation.',
  diagnose: 'Please diagnose what went wrong with the failed evaluation and give me a detailed analysis.',
} as const;

function sendPrompt(prompt: string) {
  emitter.emit('vllora_lucy_prompt', { prompt });
}

// =============================================================================
// Component
// =============================================================================

export function LucyFailedJobCard({
  errorMessage,
  failedAt,
}: FailedJobCardProps) {
  const [clicked, setClicked] = useState<string | null>(null);

  const handleClick = (action: string, prompt: string) => {
    setClicked(action);
    sendPrompt(prompt);
  };

  const timeStr = failedAt
    ? new Date(failedAt).toLocaleString()
    : undefined;

  // Truncate long error messages for card display
  const displayError = errorMessage && errorMessage.length > 200
    ? errorMessage.slice(0, 200) + '...'
    : errorMessage;

  return (
    <div className="border-l-2 border-red-500 pl-3 py-2 space-y-2">
      {/* Header */}
      <div className="flex items-center gap-1.5">
        <XCircle className="w-3.5 h-3.5 text-red-500" />
        <span className="text-xs font-semibold text-foreground">Evaluation Failed</span>
      </div>

      {/* Error details */}
      <div className="text-[11px] text-muted-foreground space-y-0.5">
        {timeStr && <div>Failed at {timeStr}</div>}
        {displayError ? (
          <div className="font-mono text-red-600 dark:text-red-400 break-words">
            {displayError}
          </div>
        ) : (
          <div className="italic">
            No error details available. Ask Lucy to diagnose the issue.
          </div>
        )}
      </div>

      {/* Recovery action buttons */}
      {!clicked ? (
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            className="h-6 text-[10px] gap-1 bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white"
            onClick={() => handleClick('retry', RECOVERY_PROMPTS.retry)}
          >
            <RefreshCw className="w-3 h-3" />
            Retry Eval
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-[10px] gap-1"
            onClick={() => handleClick('diagnose', RECOVERY_PROMPTS.diagnose)}
          >
            <AlertTriangle className="w-3 h-3" />
            Diagnose
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-[10px] gap-1"
            onClick={() => handleClick('grader', RECOVERY_PROMPTS.fixGrader)}
          >
            <Pencil className="w-3 h-3" />
            Fix Grader
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-[10px] gap-1"
            onClick={() => handleClick('regenerate', RECOVERY_PROMPTS.regenerate)}
          >
            <RotateCcw className="w-3 h-3" />
            Regenerate
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Check className="w-3 h-3 text-emerald-500" />
          <span>Response sent</span>
        </div>
      )}
    </div>
  );
}
