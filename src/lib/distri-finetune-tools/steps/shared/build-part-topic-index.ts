/**
 * Build a reverse index from knowledge part ID → topic names.
 *
 * Used by KnowledgePartViewer to show "Referenced by" backlinks.
 */

import type { TopicHierarchyNode } from '@/types/dataset-types';

/** Build partId → topicName[] map from the topic hierarchy */
export function buildPartTopicIndex(
  topics: readonly TopicHierarchyNode[],
): Map<string, string[]> {
  const index = new Map<string, string[]>();

  const walk = (nodes: readonly TopicHierarchyNode[]) => {
    for (const node of nodes) {
      for (const ref of node.sourceChunkRefs ?? []) {
        const partId = ref.includes(':') ? ref.split(':')[1] : ref;
        const existing = index.get(partId) ?? [];
        if (!existing.includes(node.name)) {
          existing.push(node.name);
        }
        index.set(partId, existing);
      }
      if (node.children) walk(node.children);
    }
  };

  walk(topics);
  return index;
}
