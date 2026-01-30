/**
 * Backend-based topic hierarchy generation
 *
 * Uses the /v1/finetune/topic-hierarchy/generate endpoint
 */

import type { TopicHierarchyNode } from '@/types/dataset-types';
import { getBackendUrl } from '@/config/api';

interface BackendTopicHierarchyRequest {
  goals: string;
  depth: number;
  records: Array<{ data: unknown }>;
  max_topics?: number;
  degree?: number;
  model?: string;
  temperature?: number;
}

interface BackendTopicHierarchyResponse {
  success: boolean;
  error?: string;
  hierarchy?: TopicHierarchyNode[];
}

export interface GenerateTopicsResult {
  success: boolean;
  hierarchy?: TopicHierarchyNode[];
  error?: string;
}

/**
 * Generate topic hierarchy using the backend endpoint
 */
export async function generateTopicsViaBackend(
  goals: string,
  depth: number,
  degree: number,
  records: Array<{ data: unknown }>,
): Promise<GenerateTopicsResult> {
  const url = `${getBackendUrl()}/finetune/topic-hierarchy/generate`;

  const requestBody: BackendTopicHierarchyRequest = {
    goals,
    depth,
    degree,
    records,
    max_topics: 5,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return { success: false, error: `Backend request failed: ${response.status} ${errorText}` };
  }

  const result: BackendTopicHierarchyResponse = await response.json();

  if (!result.success) {
    return { success: false, error: result.error || 'Backend returned unsuccessful response' };
  }

  return { success: true, hierarchy: result.hierarchy };
}
