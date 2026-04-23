/**
 * LucyTrainingJobCard
 *
 * Shown in the sidebar when the user returns to a dataset where
 * a training job has completed, failed, or is still running.
 * Displays training summary with recovery/next-step action buttons.
 */

import { useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Eye,
  Loader2,
  RefreshCw,
  Rocket,
  XCircle,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { emitter } from '@/utils/eventEmitter';
import type { CatchUpTrainingJob } from '@/hooks/useFineTuneAgentChat';

// =============================================================================
// Constants
// =============================================================================

const ACTION_PROMPTS = {
  postTrainEval: 'Please run a post-training evaluation to compare the fine-tuned model against the base model.',
  viewResults: 'Show me the detailed training results — per-epoch progression, per-topic breakdown.',
  deploy: 'Training looks good. Let\'s proceed to deployment.',
  retry: 'Please retry the training job with the same configuration.',
  diagnose: 'Please diagnose what went wrong with the training job and suggest fixes.',
  checkProgress: 'What\'s the current status of the training job? Show me progress details.',
} as const;

function sendPrompt(prompt: string) {
  emitter.emit('vllora_lucy_prompt', { prompt });
}

/** Format a duration in ms to a human-readable string. */
function formatDuration(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainMins = minutes % 60;
  return remainMins > 0 ? `${hours}h ${remainMins}m` : `${hours}h`;
}

// =============================================================================
// Component
// =============================================================================

export function LucyTrainingJobCard({
  baseModel,
  fineTunedModel,
  status,
  startedAt,
  completedAt,
  epochs,
  totalRows,
  metrics,
  errorMessage,
}: CatchUpTrainingJob) {
  const [clicked, setClicked] = useState<string | null>(null);

  const handleClick = (action: string, prompt: string) => {
    setClicked(action);
    sendPrompt(prompt);
  };

  const isCompleted = status === 'completed';
  const isFailed = status === 'failed';
  const isRunning = status === 'running' || status === 'pending' || status === 'queued';

  const durationStr = startedAt && completedAt
    ? formatDuration(completedAt - startedAt)
    : undefined;

  const modelDisplay = fineTunedModel ?? baseModel;

  // Choose border color and icon based on status
  const borderColor = isFailed ? 'border-red-500' : isRunning ? 'border-blue-500' : 'border-emerald-500';
  const StatusIcon = isFailed ? XCircle : isRunning ? Loader2 : CheckCircle2;
  const iconColor = isFailed ? 'text-red-500' : isRunning ? 'text-blue-500' : 'text-emerald-500';
  const statusLabel = isFailed ? 'Training Failed' : isRunning ? 'Training In Progress' : 'Training Completed';

  return (
    <div className={`border-l-2 ${borderColor} pl-3 py-2 space-y-2`}>
      {/* Header */}
      <div className="flex items-center gap-1.5">
        <StatusIcon className={`w-3.5 h-3.5 ${iconColor} ${isRunning ? 'animate-spin' : ''}`} />
        <span className="text-xs font-semibold text-foreground">{statusLabel}</span>
      </div>

      {/* Training summary */}
      <div className="text-[11px] text-muted-foreground space-y-0.5">
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Model</span>
          <span className="font-mono text-foreground text-[10px] truncate">{modelDisplay}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {epochs != null && <span>{epochs} epochs</span>}
          {totalRows != null && <span>{totalRows} records</span>}
          {durationStr && <span>{durationStr}</span>}
        </div>
        {metrics && isCompleted && (
          <div className="flex items-center gap-2">
            <span>Reward: <span className="font-mono font-medium text-foreground">{metrics.trainReward.toFixed(3)}</span></span>
            <span>Loss: <span className="font-mono font-medium text-foreground">{metrics.loss.toFixed(3)}</span></span>
          </div>
        )}
      </div>

      {/* Error message for failed jobs */}
      {isFailed && errorMessage && (
        <div className="font-mono text-[10px] text-red-600 dark:text-red-400 break-words">
          {errorMessage.length > 200 ? `${errorMessage.slice(0, 200)}...` : errorMessage}
        </div>
      )}

      {/* Action buttons */}
      {!clicked ? (
        <div className="flex flex-wrap gap-1.5">
          {isCompleted && (
            <>
              <Button
                size="sm"
                className="h-6 text-[10px] gap-1 bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white"
                onClick={() => handleClick('postTrainEval', ACTION_PROMPTS.postTrainEval)}
              >
                <Check className="w-3 h-3" />
                Post-Train Eval
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[10px] gap-1"
                onClick={() => handleClick('results', ACTION_PROMPTS.viewResults)}
              >
                <Eye className="w-3 h-3" />
                View Results
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[10px] gap-1"
                onClick={() => handleClick('deploy', ACTION_PROMPTS.deploy)}
              >
                <Rocket className="w-3 h-3" />
                Deploy
              </Button>
            </>
          )}
          {isFailed && (
            <>
              <Button
                size="sm"
                className="h-6 text-[10px] gap-1 bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white"
                onClick={() => handleClick('retry', ACTION_PROMPTS.retry)}
              >
                <RefreshCw className="w-3 h-3" />
                Retry Training
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-[10px] gap-1"
                onClick={() => handleClick('diagnose', ACTION_PROMPTS.diagnose)}
              >
                <AlertTriangle className="w-3 h-3" />
                Diagnose
              </Button>
            </>
          )}
          {isRunning && (
            <Button
              size="sm"
              className="h-6 text-[10px] gap-1 bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white"
              onClick={() => handleClick('progress', ACTION_PROMPTS.checkProgress)}
            >
              <Eye className="w-3 h-3" />
              Check Progress
            </Button>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Zap className="w-3 h-3 text-emerald-500" />
          <span>Response sent</span>
        </div>
      )}
    </div>
  );
}
