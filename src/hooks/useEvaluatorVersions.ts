/**
 * useEvaluatorVersions
 *
 * Fetches evaluator version history for a workflow and provides helpers
 * for determining which version a job used (staleness detection).
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  getEvaluatorVersions,
  type EvaluatorVersionResponse,
} from "@/services/finetune-api";

interface UseEvaluatorVersionsResult {
  readonly versions: readonly EvaluatorVersionResponse[];
  readonly latestVersion: number | null;
  readonly totalVersions: number;
  readonly isLoading: boolean;
  /** Infer which evaluator version was active at a given timestamp (ms) */
  readonly inferVersionForTimestamp: (createdAtMs: number) => number | null;
}

export function useEvaluatorVersions(
  workflowId: string | undefined,
): UseEvaluatorVersionsResult {
  const [versions, setVersions] = useState<readonly EvaluatorVersionResponse[]>(
    [],
  );
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!workflowId) return;
    let cancelled = false;
    setIsLoading(true);

    getEvaluatorVersions(workflowId)
      .then((result) => {
        if (!cancelled) setVersions(result);
      })
      .catch(() => {
        /* non-critical — badge just won't render */
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [workflowId]);

  const latestVersion = versions.length > 0 ? versions[0].version : null;
  const totalVersions = versions.length;

  // Versions sorted ascending by created_at for binary-style lookup
  const sortedAsc = useMemo(
    () => [...versions].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [versions],
  );

  const inferVersionForTimestamp = useCallback(
    (createdAtMs: number) => {
      if (sortedAsc.length === 0) return null;

      // Find the latest version created at or before the job timestamp
      let matched: EvaluatorVersionResponse | null = null;
      for (const v of sortedAsc) {
        if (new Date(v.created_at).getTime() <= createdAtMs) {
          matched = v;
        } else {
          break;
        }
      }

      // If no version was created before the job, assume the first version
      return matched?.version ?? sortedAsc[0].version;
    },
    [sortedAsc],
  );

  return {
    versions,
    latestVersion,
    totalVersions,
    isLoading,
    inferVersionForTimestamp,
  };
}
