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
  jobId,
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
    <div className="rounded-lg border border-red-300 dark:border-red-700 bg-red-50/50 dark:bg-red-900/10 p-3 space-y-2.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <XCircle className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
          <span className="text-xs font-semibold text-foreground">Evaluation Failed</span>
        </div>
        <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
          Failed
        </span>
      </div>

      {/* Error details */}
      <div className="space-y-1">
        {timeStr && (
          <div className="text-[10px] text-muted-foreground">
            Failed at {timeStr}
          </div>
        )}
        {displayError && (
          <div className="text-[11px] bg-red-100/50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded p-2 font-mono text-red-700 dark:text-red-300 break-words">
            {displayError}
          </div>
        )}
        {!displayError && (
          <div className="text-[11px] text-muted-foreground italic">
            No error details available. Ask Lucy to diagnose the issue.
          </div>
        )}
      </div>

      {/* Job ID reference */}
      <div className="text-[10px] text-muted-foreground">
        Job: <code className="bg-muted px-1 py-0.5 rounded text-[9px]">{jobId.slice(0, 8)}...</code>
      </div>

      {/* Recovery action buttons */}
      {!clicked ? (
        <div className="grid grid-cols-2 gap-1.5 pt-0.5">
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
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground pt-0.5">
          <Check className="w-3 h-3 text-emerald-500" />
          <span>Response sent</span>
        </div>
      )}
    </div>
  );
}
