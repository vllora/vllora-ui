import { SpanWithMessages } from '@/utils/span-to-message';

/**
 * Compares two messages for equality based on role, content, and content_array
 */
export const areMessagesEqual = (msg1: any, msg2: any): boolean => {
  if (msg1.role !== msg2.role) return false;
  if (msg1.content !== msg2.content) return false;

  // Compare content_array
  const arr1 = msg1.content_array || [];
  const arr2 = msg2.content_array || [];

  if (arr1.length !== arr2.length) return false;

  return arr1.every((item1: any, idx: number) => {
    const item2 = arr2[idx];
    return JSON.stringify(item1) === JSON.stringify(item2);
  });
};

/**
 * Checks if spanA's messages are completely included in spanB (in the same order)
 * Returns true if spanB contains all of spanA's messages as a contiguous subsequence
 */
export const isSubsetOfMessages = (spanA: SpanWithMessages, spanB: SpanWithMessages): boolean => {
  const messagesA = spanA.messages;
  const messagesB = spanB.messages;

  if (messagesA.length === 0) return true;
  if (messagesA.length > messagesB.length) return false;

  // Try to find messagesA as a contiguous subsequence in messagesB
  for (let i = 0; i <= messagesB.length - messagesA.length; i++) {
    let allMatch = true;
    for (let j = 0; j < messagesA.length; j++) {
      if (!areMessagesEqual(messagesA[j], messagesB[i + j])) {
        allMatch = false;
        break;
      }
    }
    if (allMatch) return true;
  }

  return false;
};

/**
 * Extracts and deduplicates spans with messages from the hierarchy
 * Within the same run_id, removes spans whose messages are completely included
 * in another span's messages (in the same order)
 * Preserves original order of appearance
 */
export const extractValidDisplayMessages = (messages: SpanWithMessages[], level: number = 0): SpanWithMessages[] => {
  let result: SpanWithMessages[] = [];

  // Recursively collect all spans with messages
  for (const spanWithMessages of messages) {
    if (spanWithMessages.messages.length > 0) {
      result.push(spanWithMessages);
    }
    if (spanWithMessages.children && spanWithMessages.children.length > 0) {
      result.push(...extractValidDisplayMessages(spanWithMessages.children, level + 1));
    }
  }

  // Group spans by run_id
  const spansByRunId = new Map<string, SpanWithMessages[]>();

  result.forEach((span) => {
    const runId = span.run_id || `unique:${span.span_id}`;
    if (!spansByRunId.has(runId)) {
      spansByRunId.set(runId, []);
    }
    spansByRunId.get(runId)!.push(span);
  });

  // Within each run_id group, remove spans that are subsets of other spans
  const spansToKeep = new Set<SpanWithMessages>();

  spansByRunId.forEach((spans) => {
    if (spans.length === 1) {
      // Only one span for this run_id, keep it
      spansToKeep.add(spans[0]);
      return;
    }

    // Check each span to see if it's a subset of any other span
    spans.forEach((spanA) => {
      let isSubset = false;

      for (const spanB of spans) {
        if (spanA === spanB) continue;

        // If spanA's messages are completely included in spanB, mark spanA as subset
        if (isSubsetOfMessages(spanA, spanB)) {
          isSubset = true;
          break;
        }
      }

      // Keep spanA only if it's not a subset of any other span
      if (!isSubset) {
        spansToKeep.add(spanA);
      }
    });
  });

  // Filter result to preserve original order
  return result.filter((span) => spansToKeep.has(span));
};
