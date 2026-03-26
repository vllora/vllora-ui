/**
 * useEvaluatorVersions
 *
 * Fetches evaluator version history for a workflow and provides helpers
 * for determining which version a job used (staleness detection).
 *
 * Uses a module-level cache so multiple components mounting with the same
 * workflowId share a single fetch instead of each firing their own request.
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

// Module-level shared cache: workflowId → { data, promise, timestamp }
const versionCache = new Map<
  string,
  {
    data: readonly EvaluatorVersionResponse[];
    promise: Promise<readonly EvaluatorVersionResponse[]> | null;
    fetchedAt: number;
  }
>();

const CACHE_TTL_MS = 30_000; // 30s — versions rarely change

function fetchVersionsCached(
  workflowId: string,
): Promise<readonly EvaluatorVersionResponse[]> {
  const cached = versionCache.get(workflowId);

  // Return cached data if fresh
  if (cached && cached.data.length > 0 && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return Promise.resolve(cached.data);
  }

  // Return in-flight promise if one exists
  if (cached?.promise) {
    return cached.promise;
  }

  // Start new fetch
  const promise = getEvaluatorVersions(workflowId)
    .then((result) => {
      versionCache.set(workflowId, { data: result, promise: null, fetchedAt: Date.now() });
      return result;
    })
    .catch((err) => {
      // Clear failed promise so next caller retries
      const entry = versionCache.get(workflowId);
      if (entry) entry.promise = null;
      throw err;
    });

  versionCache.set(workflowId, {
    data: cached?.data ?? [],
    promise,
    fetchedAt: cached?.fetchedAt ?? 0,
  });

  return promise;
}

export function useEvaluatorVersions(
  workflowId: string | undefined,
): UseEvaluatorVersionsResult {
  const [versions, setVersions] = useState<readonly EvaluatorVersionResponse[]>(
    () => (workflowId ? versionCache.get(workflowId)?.data ?? [] : []),
  );
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!workflowId) return;
    let cancelled = false;
    setIsLoading(true);

    fetchVersionsCached(workflowId)
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
