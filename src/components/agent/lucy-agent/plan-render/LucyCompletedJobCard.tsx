/**
 * LucyCompletedJobCard
 *
 * Shown in the sidebar when the user returns to a dataset where
 * an evaluation job has completed but hasn't been reviewed yet.
 * Provides a "Welcome Back" experience with job summary and action buttons.
 */

import { useState } from 'react';
import {
  Check,
  CheckCircle2,
  Eye,
  FlaskConical,
  Rocket,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { emitter } from '@/utils/eventEmitter';

// =============================================================================
// Types
// =============================================================================

interface CompletedJobCardProps {
  readonly jobId: string;
  readonly averageScore?: number;
  readonly completedAt?: number;
  readonly verdict?: string;
  readonly totalRows?: number;
}

// =============================================================================
// Constants
// =============================================================================

const ACTION_PROMPTS = {
  analyze: 'Please analyze the evaluation results in detail and tell me what you recommend.',
  postTrainEval: 'Please run a post-training evaluation to compare the fine-tuned model against the base model.',
  deploy: 'The evaluation looks good. Let\'s proceed to deployment.',
  viewResults: 'Show me the detailed evaluation results — per-topic breakdown and recommendations.',
} as const;

function sendPrompt(prompt: string) {
  emitter.emit('vllora_lucy_prompt', { prompt });
}

// =============================================================================
// Component
// =============================================================================

export function LucyCompletedJobCard({
  averageScore,
  completedAt,
  verdict,
  totalRows,
}: CompletedJobCardProps) {
  const [clicked, setClicked] = useState<string | null>(null);

  const handleClick = (action: string, prompt: string) => {
    setClicked(action);
    sendPrompt(prompt);
  };

  const timeStr = completedAt
    ? new Date(completedAt).toLocaleString()
    : undefined;

  const scoreStr = averageScore != null
    ? averageScore.toFixed(2)
    : undefined;

  const isHealthy = verdict === 'GO' || (averageScore != null && averageScore >= 0.5);

  return (
    <div className="border-l-2 border-emerald-500 pl-3 py-2 space-y-2">
      {/* Header */}
      <div className="flex items-center gap-1.5">
        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
        <span className="text-xs font-semibold text-foreground">Welcome Back</span>
        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
          — Evaluation completed
        </span>
      </div>

      {/* Inline summary */}
      <div className="text-[11px] text-muted-foreground space-y-0.5">
        {timeStr && <div>Completed at {timeStr}</div>}
        {scoreStr && (
          <div>
            Average score: <span className="font-mono font-medium text-foreground">{scoreStr}</span>
            {totalRows != null && <span> · {totalRows} records</span>}
          </div>
        )}
        {!scoreStr && totalRows != null && <div>{totalRows} records evaluated</div>}
      </div>

      {/* Action buttons */}
      {!clicked ? (
        <div className="flex flex-wrap gap-1.5">
          <Button
            size="sm"
            className="h-6 text-[10px] gap-1 bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white"
            onClick={() => handleClick('analyze', ACTION_PROMPTS.analyze)}
          >
            <Eye className="w-3 h-3" />
            View Analysis
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-[10px] gap-1"
            onClick={() => handleClick('results', ACTION_PROMPTS.viewResults)}
          >
            <FlaskConical className="w-3 h-3" />
            Details
          </Button>
          {isHealthy && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[10px] gap-1"
              onClick={() => handleClick('deploy', ACTION_PROMPTS.deploy)}
            >
              <Rocket className="w-3 h-3" />
              Deploy
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-[10px] gap-1"
            onClick={() => handleClick('postTrainEval', ACTION_PROMPTS.postTrainEval)}
          >
            <Check className="w-3 h-3" />
            Post-Train Eval
          </Button>
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
