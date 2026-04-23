/**
 * QueryOriginBadge
 *
 * Displays whether a training record's user query came from real traces
 * (seed query) or was LLM-generated (synthetic). Only shown when trace
 * analysis data is available (combined mode).
 */

import { Fingerprint, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export type QueryOrigin = "seed" | "synthetic";

interface QueryOriginBadgeProps {
  /** "seed" = real user query from traces, "synthetic" = LLM-generated */
  readonly origin: QueryOrigin;
  /** Optional: show as compact (icon only) or full (icon + text) */
  readonly compact?: boolean;
}

/**
 * Determine query origin from a record's prompt_type field.
 * Records with prompt_type "seed_query" are from traces.
 */
export function getQueryOrigin(promptType: string | undefined): QueryOrigin {
  return promptType === "seed_query" ? "seed" : "synthetic";
}

export function QueryOriginBadge({ origin, compact = false }: QueryOriginBadgeProps) {
  const isSeed = origin === "seed";

  if (compact) {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center w-5 h-5 rounded-full",
          isSeed
            ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
            : "bg-zinc-500/10 text-zinc-500 dark:text-zinc-400",
        )}
        title={isSeed ? "Seed query (from real traces)" : "Synthetic query (LLM-generated)"}
      >
        {isSeed ? (
          <Fingerprint className="w-3 h-3" />
        ) : (
          <Sparkles className="w-3 h-3" />
        )}
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium",
        isSeed
          ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
          : "bg-zinc-500/10 text-zinc-500 dark:text-zinc-400",
      )}
      title={isSeed ? "Real user query from production traces" : "LLM-generated synthetic query"}
    >
      {isSeed ? (
        <Fingerprint className="w-3 h-3" />
      ) : (
        <Sparkles className="w-3 h-3" />
      )}
      {isSeed ? "Trace" : "Synthetic"}
    </span>
  );
}
