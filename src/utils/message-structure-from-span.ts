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
  if (skipThisSpan(span)) return true;
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

  const spanMap = new Map<string, Span>();
  const messageMap = new Map<string, MessageStructure>();

  // Sort spans by start time
  const sortedSpans = flattenSpans.sort(
    (a, b) => a.start_time_us - b.start_time_us
  );

  // Create span lookup map
  sortedSpans.forEach((span) => {
    spanMap.set(span.span_id, span);
  });

  // First pass: Create MessageStructure for non-skipped spans
  sortedSpans.forEach((span) => {
    if (skipSpanNotRelatedToMessage(span)) return;

    const message: MessageStructure = {
      span_id: span.span_id,
      type: span.operation_name,
      run_id: span.run_id,
      children: [],
    };
    messageMap.set(span.span_id, message);
  });

  // Second pass: Build hierarchy, connecting to nearest non-skipped parent
  const result: MessageStructure[] = [];

  sortedSpans.forEach((span) => {
    if (skipSpanNotRelatedToMessage(span)) return;

    const message = messageMap.get(span.span_id)!;
    const nonSkippedParentId = findNonSkippedParent(span, spanMap);

    if (!nonSkippedParentId) {
      // Root message (no parent or all ancestors skipped)
      result.push(message);
    } else {
      // Child message - add to nearest non-skipped parent
      const parent = messageMap.get(nonSkippedParentId);
      if (parent) {
        parent.children.push(message);
      } else {
        // Parent not found in message map, treat as root
        result.push(message);
      }
    }
  });
  if(result.length > 0){
    if(result.length === 1 && result[0].type === 'run' ){
      let runById = spanMap.get(result[0].span_id);
      if(runById && isClientSDK(runById)) return result;
    }
     // mean there are multiple root spans
     let runIds: string[] = []
     result.forEach((message) => {
       if(!runIds.includes(message.run_id)){
         runIds.push(message.run_id)
       }
     })
     if(runIds.length > 0){
      let newResult: MessageStructure[] = [];
      runIds.forEach((runId) => {
        let runMessage: MessageStructure = {
          span_id: runId,
          type: 'run_wrapper',
          run_id: runId,
          children: result.filter((message) => message.run_id === runId),
        };
        newResult.push(runMessage);
      })
      return newResult;
     }
  }

  return result;
}
