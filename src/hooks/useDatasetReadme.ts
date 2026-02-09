/**
 * useDatasetReadme Hook
 *
 * Auto-generates and updates the README for a dataset when relevant data changes.
 * The README is stored in IndexedDB and can be exported as a markdown file.
 */

import { useEffect, useCallback, useRef } from 'react';
import { generateDatasetReadme, exportDatasetReadme } from '@/services/dataset-readme-generator';
import * as datasetsDB from '@/services/datasets-db';
import * as workflowDB from '@/services/finetune-workflow-db';
import type { Dataset, DatasetRecord } from '@/types/dataset-types';

interface UseDatasetReadmeOptions {
  dataset: Dataset | null;
  records: DatasetRecord[];
  /** Whether to auto-update the README when data changes */
  autoUpdate?: boolean;
}

interface UseDatasetReadmeReturn {
  /** Current README content */
  readme: string | null;
  /** Last time README was updated */
  readmeUpdatedAt: number | null;
  /** Manually regenerate the README */
  regenerateReadme: () => Promise<void>;
  /** Export README as a .md file */
  exportReadme: () => void;
}

/**
 * Hook to manage dataset README generation and updates
 */
export function useDatasetReadme({
  dataset,
  records,
  autoUpdate = true,
}: UseDatasetReadmeOptions): UseDatasetReadmeReturn {
  // Track if we're currently updating to prevent race conditions
  const isUpdating = useRef(false);

  // Track previous values to detect changes
  const prevDataRef = useRef<{
    recordCount: number;
    topicHierarchyHash: string;
    coverageStatsHash: string;
    dryRunStatsHash: string;
    objective: string;
  } | null>(null);

  /**
   * Regenerate the README and save to IndexedDB
   */
  const regenerateReadme = useCallback(async () => {
    if (!dataset || isUpdating.current) return;

    isUpdating.current = true;

    try {
      // Get workflow if available
      const workflow = await workflowDB.getWorkflow(dataset.id);

      // Generate the README
      const readme = generateDatasetReadme({
        dataset,
        records,
        workflow,
      });

      // Save to IndexedDB
      await datasetsDB.updateDatasetReadme(dataset.id, readme);
    } catch (error) {
      console.error('[useDatasetReadme] Failed to regenerate README:', error);
    } finally {
      isUpdating.current = false;
    }
  }, [dataset, records]);

  /**
   * Export the README as a downloadable file
   */
  const exportReadme = useCallback(() => {
    if (!dataset) return;
    exportDatasetReadme(dataset);
  }, [dataset]);

  /**
   * Auto-update README when relevant data changes
   */
  useEffect(() => {
    if (!autoUpdate || !dataset) return;

    // Create hashes of relevant data to detect changes
    const currentData = {
      recordCount: records.length,
      topicHierarchyHash: JSON.stringify(dataset.topicHierarchy?.hierarchy || []),
      coverageStatsHash: JSON.stringify(dataset.coverageStats || {}),
      dryRunStatsHash: JSON.stringify(dataset.dryRunStats?.lastRunAt || 0),
      objective: dataset.datasetObjective || '',
    };

    // Check if this is initial load or if data has changed
    const prevData = prevDataRef.current;
    const hasChanged =
      !prevData ||
      prevData.recordCount !== currentData.recordCount ||
      prevData.topicHierarchyHash !== currentData.topicHierarchyHash ||
      prevData.coverageStatsHash !== currentData.coverageStatsHash ||
      prevData.dryRunStatsHash !== currentData.dryRunStatsHash ||
      prevData.objective !== currentData.objective;

    // Update previous data ref
    prevDataRef.current = currentData;

    // Regenerate if data has changed
    if (hasChanged) {
      // Debounce to prevent rapid updates
      const timeoutId = setTimeout(() => {
        regenerateReadme();
      }, 500);

      return () => clearTimeout(timeoutId);
    }
  }, [
    autoUpdate,
    dataset,
    records.length,
    dataset?.topicHierarchy?.hierarchy,
    dataset?.coverageStats,
    dataset?.dryRunStats?.lastRunAt,
    dataset?.datasetObjective,
    regenerateReadme,
  ]);

  return {
    readme: dataset?.readme || null,
    readmeUpdatedAt: dataset?.readmeUpdatedAt || null,
    regenerateReadme,
    exportReadme,
  };
}
