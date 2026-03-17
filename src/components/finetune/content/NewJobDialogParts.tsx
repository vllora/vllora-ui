/**
 * NewJobDialogParts
 *
 * Sub-components and helpers for the NewJobDialog.
 * Extracted to keep NewJobDialog.tsx focused on the main dialog logic.
 */

import { Input } from "@/components/ui/input";
import { FlaskConical, TrendingUp } from "lucide-react";
import {
  DEFAULT_TRAINING_CONFIG,
  DEFAULT_INFERENCE_PARAMETERS,
  type FinetuneTrainingConfig,
  type FinetuneInferenceParameters,
} from "@/services/finetune-api";
import type { LatestEvalInfo } from "./NewJobDialog";

/* ── Shared input classes (matches NewEvaluationDialog) ── */
const INPUT_CLS =
  "h-8 text-xs border-border/50 bg-muted/30 focus-visible:ring-0 focus-visible:ring-offset-0";

// ─── Utilities ───────────────────────────────────────────────────────────────

export function formatRelativeTime(timestampMs: number): string {
  const diffMs = Date.now() - timestampMs;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function buildTrainingConfig(
  learningRate: string,
  epochs: string,
  batchSize: string,
  loraRank: string,
): Partial<FinetuneTrainingConfig> {
  const config: Partial<FinetuneTrainingConfig> = {};
  const lr = parseFloat(learningRate);
  if (!isNaN(lr) && lr !== DEFAULT_TRAINING_CONFIG.learning_rate) {
    config.learning_rate = lr;
  }
  const ep = parseFloat(epochs);
  if (!isNaN(ep) && ep !== DEFAULT_TRAINING_CONFIG.epochs) {
    config.epochs = ep;
  }
  const bs = parseInt(batchSize, 10);
  if (!isNaN(bs) && bs !== DEFAULT_TRAINING_CONFIG.batch_size) {
    config.batch_size = bs;
  }
  const rank = parseInt(loraRank, 10);
  if (!isNaN(rank) && rank !== DEFAULT_TRAINING_CONFIG.lora_rank) {
    config.lora_rank = rank;
  }
  return config;
}

export function buildInferenceParams(
  maxOutputTokens: string,
  temperature: string,
  responseCandidatesCount: string,
): Partial<FinetuneInferenceParameters> {
  const params: Partial<FinetuneInferenceParameters> = {};
  const mot = parseInt(maxOutputTokens, 10);
  if (!isNaN(mot) && mot !== DEFAULT_INFERENCE_PARAMETERS.max_output_tokens) {
    params.max_output_tokens = mot;
  }
  const temp = parseFloat(temperature);
  if (!isNaN(temp) && temp !== DEFAULT_INFERENCE_PARAMETERS.temperature) {
    params.temperature = temp;
  }
  const rcc = parseInt(responseCandidatesCount, 10);
  if (!isNaN(rcc) && rcc !== DEFAULT_INFERENCE_PARAMETERS.response_candidates_count) {
    params.response_candidates_count = rcc;
  }
  return params;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

interface EvalSummaryCardProps {
  readonly eval: LatestEvalInfo;
  readonly evaluatorVersion?: number | null;
  readonly isStale: boolean;
}

export function EvalSummaryCard({ eval: evalInfo, evaluatorVersion, isStale }: EvalSummaryCardProps) {
  const detailParts = [
    `${evalInfo.sampleSize} samples`,
    evalInfo.model,
    formatRelativeTime(evalInfo.timestamp),
  ];

  return (
    <div
      className={`flex items-center gap-2.5 rounded-lg border p-2.5 ${
        isStale
          ? "border-amber-500/20 bg-amber-500/[0.03]"
          : "border-emerald-500/15 bg-emerald-500/[0.04]"
      }`}
    >
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
          isStale ? "bg-amber-500/10" : "bg-emerald-500/10"
        }`}
      >
        <FlaskConical
          className={`h-3.5 w-3.5 ${
            isStale ? "text-amber-500" : "text-emerald-500"
          }`}
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-xs font-medium">
          Latest Evaluation
          {evaluatorVersion != null && evaluatorVersion > 0 && (
            <span className="rounded border border-purple-500/20 bg-purple-500/10 px-1.5 py-px text-[10px] font-medium text-purple-400">
              v{evaluatorVersion}
            </span>
          )}
          {isStale && (
            <span className="rounded border border-amber-500/20 bg-amber-500/10 px-1.5 py-px text-[10px] font-medium text-amber-500">
              stale
            </span>
          )}
        </div>
        <div className="text-[10px] text-muted-foreground/60 mt-0.5">
          {detailParts.join(" \u00B7 ")}
        </div>
      </div>
      <span
        className={`shrink-0 font-mono text-base font-bold ${
          isStale ? "text-amber-500" : "text-emerald-500"
        }`}
      >
        {evalInfo.score.toFixed(2)}
      </span>
    </div>
  );
}

interface PreviousBestCardProps {
  readonly score: number;
  readonly timestamp?: number;
}

export function PreviousBestCard({ score, timestamp }: PreviousBestCardProps) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-emerald-500/10 bg-emerald-500/[0.03] px-3 py-2">
      <TrendingUp className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
      <span className="flex-1 text-[11px] text-muted-foreground">
        Previous best training score
      </span>
      <span className="font-mono text-[13px] font-semibold text-emerald-500">
        {score.toFixed(2)}
      </span>
      {timestamp != null && (
        <span className="text-[10px] text-muted-foreground/50">
          &middot; {formatRelativeTime(timestamp)}
        </span>
      )}
    </div>
  );
}

// ─── Advanced field groups ───────────────────────────────────────────────────

interface AdvancedTrainingFieldsProps {
  readonly learningRate: string;
  readonly batchSize: string;
  readonly loraRank: string;
  readonly onLearningRateChange: (v: string) => void;
  readonly onBatchSizeChange: (v: string) => void;
  readonly onLoraRankChange: (v: string) => void;
}

export function AdvancedTrainingFields({
  learningRate, batchSize, loraRank,
  onLearningRateChange, onBatchSizeChange, onLoraRankChange,
}: AdvancedTrainingFieldsProps) {
  return (
    <div className="space-y-2">
      <span className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider">
        Training
      </span>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">Learning Rate</label>
          <Input
            type="number"
            step="0.00001"
            value={learningRate}
            onChange={(e) => onLearningRateChange(e.target.value)}
            className={INPUT_CLS}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">Batch Size</label>
          <Input
            type="number"
            value={batchSize}
            onChange={(e) => onBatchSizeChange(e.target.value)}
            className={INPUT_CLS}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">LoRA Rank</label>
          <Input
            type="number"
            value={loraRank}
            onChange={(e) => onLoraRankChange(e.target.value)}
            className={INPUT_CLS}
          />
        </div>
      </div>
    </div>
  );
}

interface AdvancedInferenceFieldsProps {
  readonly maxOutputTokens: string;
  readonly temperature: string;
  readonly responseCandidatesCount: string;
  readonly onMaxOutputTokensChange: (v: string) => void;
  readonly onTemperatureChange: (v: string) => void;
  readonly onResponseCandidatesCountChange: (v: string) => void;
}

export function AdvancedInferenceFields({
  maxOutputTokens, temperature, responseCandidatesCount,
  onMaxOutputTokensChange, onTemperatureChange, onResponseCandidatesCountChange,
}: AdvancedInferenceFieldsProps) {
  return (
    <div className="space-y-2">
      <span className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider">
        Inference
      </span>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">Max Tokens</label>
          <Input
            type="number"
            value={maxOutputTokens}
            onChange={(e) => onMaxOutputTokensChange(e.target.value)}
            className={INPUT_CLS}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">Temperature</label>
          <Input
            type="number"
            step="0.1"
            min="0"
            max="2"
            value={temperature}
            onChange={(e) => onTemperatureChange(e.target.value)}
            className={INPUT_CLS}
          />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] text-muted-foreground">Response Candidates</label>
          <Input
            type="number"
            min="1"
            value={responseCandidatesCount}
            onChange={(e) => onResponseCandidatesCountChange(e.target.value)}
            className={INPUT_CLS}
          />
        </div>
      </div>
    </div>
  );
}
