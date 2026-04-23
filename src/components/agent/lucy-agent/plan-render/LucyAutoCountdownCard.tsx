/**
 * LucyAutoCountdownCard
 *
 * Shown after evaluation when scores are healthy and next_action is 'train'.
 * Automatically counts down and sends a "Proceed to Training" prompt.
 * User can cancel to review manually or skip the countdown.
 *
 * Mockup Scenario #3: Auto-Continue
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Check,
  Pause,
  Rocket,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { emitter } from '@/utils/eventEmitter';

// =============================================================================
// Constants
// =============================================================================

const COUNTDOWN_SECONDS = 8;

const PROMPTS = {
  proceed: 'The evaluation scores look good. Please proceed to training.',
  iterate: 'I want to run another iteration before training. Please propose changes to improve the weak areas.',
} as const;

function sendPrompt(prompt: string) {
  emitter.emit('vllora_lucy_prompt', { prompt });
}

// =============================================================================
// Component
// =============================================================================

export function LucyAutoCountdownCard() {
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SECONDS);
  const [cancelled, setCancelled] = useState(false);
  const [sent, setSent] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  // Start countdown on mount
  useEffect(() => {
    if (cancelled || sent) return;

    intervalRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return clearTimer;
  }, [cancelled, sent, clearTimer]);

  // Auto-send when countdown reaches zero
  useEffect(() => {
    if (secondsLeft === 0 && !cancelled && !sent) {
      clearTimer();
      setSent(true);
      sendPrompt(PROMPTS.proceed);
    }
  }, [secondsLeft, cancelled, sent, clearTimer]);

  const handleCancel = () => {
    clearTimer();
    setCancelled(true);
  };

  const handleProceedNow = () => {
    clearTimer();
    setSent(true);
    sendPrompt(PROMPTS.proceed);
  };

  const handleIterate = () => {
    clearTimer();
    setSent(true);
    sendPrompt(PROMPTS.iterate);
  };

  // Already sent
  if (sent) {
    return (
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground pt-0.5">
        <Zap className="w-3 h-3 text-emerald-500" />
        <span>Proceeding to training</span>
      </div>
    );
  }

  // Cancelled — show manual action buttons
  if (cancelled) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Pause className="w-3 h-3" />
          <span>Auto-continue paused — take your time</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            className="h-6 text-[10px] gap-1 flex-1 bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white"
            onClick={handleProceedNow}
          >
            <Rocket className="w-3 h-3" />
            Proceed to Training
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-[10px] gap-1"
            onClick={handleIterate}
          >
            <Zap className="w-3 h-3" />
            Iterate More
          </Button>
        </div>
      </div>
    );
  }

  // Counting down
  const progress = ((COUNTDOWN_SECONDS - secondsLeft) / COUNTDOWN_SECONDS) * 100;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Check className="w-3 h-3 text-emerald-500" />
          <span>Scores healthy — auto-continuing in {secondsLeft}s</span>
        </div>
        <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 animate-pulse">
          Auto-continue
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-emerald-500 rounded-full transition-all duration-1000 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          className="h-6 text-[10px] gap-1 flex-1"
          onClick={handleCancel}
        >
          <Pause className="w-3 h-3" />
          Wait, I want to review
        </Button>
        <Button
          size="sm"
          className="h-6 text-[10px] gap-1 bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white"
          onClick={handleProceedNow}
        >
          <Rocket className="w-3 h-3" />
          Start Now
        </Button>
      </div>
    </div>
  );
}
