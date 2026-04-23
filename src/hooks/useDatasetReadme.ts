/**
 * useDatasetReadme Hook
 *
 * Exposes the README stored on the dataset (written by Lucy via update_workflow_readme tool).
 * No auto-generation or template fallback — README is agent-authored only.
 */

import { useCallback } from 'react';
import type { Dataset } from '@/types/dataset-types';

interface UseDatasetReadmeOptions {
  dataset: Dataset | null;
}

interface UseDatasetReadmeReturn {
  /** Current README content */
  readme: string | null;
  /** Last time README was updated */
  readmeUpdatedAt: number | null;
  /** Export README as a .md file */
  exportReadme: () => void;
}

export function useDatasetReadme({
  dataset,
}: UseDatasetReadmeOptions): UseDatasetReadmeReturn {
  const exportReadme = useCallback(() => {
    if (!dataset?.readme) return;

    const blob = new Blob([dataset.readme], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(dataset.name || 'dataset').replace(/\s+/g, '-')}-README.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [dataset]);

  return {
    readme: dataset?.readme || null,
    readmeUpdatedAt: dataset?.readmeUpdatedAt || null,
    exportReadme,
  };
}
