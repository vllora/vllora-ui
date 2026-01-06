import { Span } from "@/types/common-type";
import { isClientSDK, skipThisSpan } from "./graph-utils";

export interface MessageStructure {
  span_id: string;
  type: string; // run, task,
  run_id: string;
  children: MessageStructure[];
}


const skipSpanNotRelatedToMessage = (span: Span) => {
  if(span.operation_name === 'tool') return false;
  if(span.operation_name === 'api_invoke') return false;
  if (skipThisSpan(span)) return true;
  if(['cost', 'text_message', 'raw', 'llm_stop', 'task'].includes(span.operation_name)) return true;
  if(span.operation_name === 'run' && !isClientSDK(span)) return true;
  if(span.operation_name === 'api_invoke' && span.attribute && span.attribute['error']) return false;
  // if(span.operation_name === 'run') return true;
  return false;
}
// Helper function to find the nearest non-skipped ancestor
const findNonSkippedParent = (
  span: Span,
  spanMap: Map<string, Span>
): string | null => {
  if (!span.parent_span_id) return null;

  const parent = spanMap.get(span.parent_span_id);
  if (!parent) return null;

  // If parent should be skipped, recursively find its parent
  if (skipSpanNotRelatedToMessage(parent)) {
    return findNonSkippedParent(parent, spanMap);
  }

  return parent.span_id;
};
export function buildMessageHierarchyFromSpan(
  flattenSpans: Span[]
): MessageStructure[] {
  // Early return for empty array
  if (flattenSpans.length === 0) return [];

  const spanMap = new Map<string, Span>();
  const messageMap = new Map<string, MessageStructure>();

  // Sort spans by start time - use slice() to avoid mutating input
  const sortedSpans = flattenSpans.slice().sort(
    (a, b) => a.start_time_us - b.start_time_us
  );

  // Single pass: Create span lookup map and MessageStructure for non-skipped spans
  for (const span of sortedSpans) {
    spanMap.set(span.span_id, span);

    if (!skipSpanNotRelatedToMessage(span)) {
      messageMap.set(span.span_id, {
        span_id: span.span_id,
        type: span.operation_name,
        run_id: span.run_id,
        children: [],
      });
    }
  }

  // Build hierarchy, connecting to nearest non-skipped parent
  const result: MessageStructure[] = [];
  // Group by run_id for O(1) lookup instead of O(n) filter
  const messagesByRunId = new Map<string, MessageStructure[]>();

  for (const span of sortedSpans) {
    if (skipSpanNotRelatedToMessage(span)) continue;

    const message = messageMap.get(span.span_id)!;
    const nonSkippedParentId = findNonSkippedParent(span, spanMap);

    if (!nonSkippedParentId) {
      // Root message (no parent or all ancestors skipped)
      result.push(message);
      // Track by run_id for efficient grouping later
      const runMessages = messagesByRunId.get(message.run_id);
      if (runMessages) {
        runMessages.push(message);
      } else {
        messagesByRunId.set(message.run_id, [message]);
      }
    } else {
      // Child message - add to nearest non-skipped parent
      const parent = messageMap.get(nonSkippedParentId);
      if (parent) {
        parent.children.push(message);
      } else {
        // Parent not found in message map, treat as root
        result.push(message);
        const runMessages = messagesByRunId.get(message.run_id);
        if (runMessages) {
          runMessages.push(message);
        } else {
          messagesByRunId.set(message.run_id, [message]);
        }
      }
    }
  }

  if (result.length === 0) return result;

  // Check if single run from client SDK
  if (result.length === 1 && result[0].type === 'run') {
    const runById = spanMap.get(result[0].span_id);
    if (runById && isClientSDK(runById)) return result;
  }

  // Wrap roots by run_id using pre-computed map (O(1) instead of O(n) filter)
  // Original behavior: wrap all roots except single client SDK run (which returned above)
  if (messagesByRunId.size > 0) {
    const newResult: MessageStructure[] = [];
    for (const [runId, messages] of messagesByRunId) {
      newResult.push({
        span_id: runId,
        type: 'run_wrapper',
        run_id: runId,
        children: messages,
      });
    }
    return newResult;
  }

  return result;
}
