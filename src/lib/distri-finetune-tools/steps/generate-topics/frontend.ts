/**
 * Frontend-based topic hierarchy generation
 *
 * Uses the existing LLM-based topic generation from distri-dataset-tools
 */

import type { TopicHierarchyNode } from '@/types/dataset-types';
import { generateTopics as existingGenerateTopics } from '@/lib/distri-dataset-tools/analysis/generate-topics';
import { buildHierarchyFromAnalysis } from '../helpers';

export interface GenerateTopicsResult {
  success: boolean;
  hierarchy?: TopicHierarchyNode[];
  error?: string;
}

/**
 * Generate topic hierarchy using frontend LLM calls
 */
export async function generateTopicsViaFrontend(
  datasetId: string,
  depth: number,
  degree: number,
): Promise<GenerateTopicsResult> {
  const result = await existingGenerateTopics({
    datasetId,
    maxDepth: depth,
    degree,
  });

  if (!result.success || !result.analysis) {
    return { success: false, error: result.error || 'Failed to generate topics' };
  }

  // Convert analysis to hierarchy structure
  const hierarchy = buildHierarchyFromAnalysis(result.analysis);

  return { success: true, hierarchy };
}
