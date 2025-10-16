import { Span } from '@/types/common-type';
import { Message, MessageMetrics } from '@/types/chat';
import { tryParseJson } from '@/utils/modelUtils';

/**
 * Checks if a span is an actual model call that contains messages
 *
 * @param span - The span to check
 * @returns true if the span is a model call (not wrapper operations)
 */
export function isActualModelCall(span: Span): boolean {
  const operationName = span.operation_name;
  return !!(
    operationName &&
    !['api_invoke', 'cloud_api_invoke', 'model_call', 'tool_call', 'tools'].includes(operationName) &&
    !operationName.startsWith('guard_')
  );
}

/**
 * SpanWithMessages represents a span that contains extractable messages
 */
export interface SpanWithMessages {
  span_id: string;
  run_id: string;
  trace_id: string;
  messages: Message[];
  level: number;
  children?: SpanWithMessages[];
}

/**
 * Converts hierarchical spans to messages extracted from model call spans
 * Only spans where isActualModelCall() returns true will have messages extracted
 *
 * @param spans - Array of hierarchical spans (with nested children)
 * @param level - Current hierarchy level (0 for root)
 * @returns Array of Message objects flattened from all model call spans
 *
 * @example
 * ```typescript
 * const hierarchy = buildSpanHierarchy(flatSpans);
 * const messages = convertSpansToMessages(hierarchy);
 * // Only messages from actual model call spans
 * ```
 */
export function convertSpansToMessages(spans: Span[], level: number = 0): SpanWithMessages[] {
  const messages: SpanWithMessages[] = [];  
  for (const span of spans) {

    const newSpanWithMessages: SpanWithMessages = {
      span_id: span.span_id,
      run_id: span.run_id,
      trace_id: span.trace_id,
      messages: [],
      level,
    };
    // Extract messages from this span if it's a model call
    if (isActualModelCall(span)) {
      const spanMessages = extractMessagesFromSpan(span, level);
      newSpanWithMessages.messages = spanMessages;
    }

    // Recursively process children
    if (span.spans && span.spans.length > 0) {
      const childMessages = convertSpansToMessages(span.spans, level + 1);
      newSpanWithMessages.children = childMessages;
    }
    messages.push(newSpanWithMessages);
  }

  // Sort by timestamp
  return messages;
}

/**
 * Extracts messages from a single model call span
 *
 * @param span - The span to extract messages from
 * @returns Array of Message objects extracted from the span's request
 */
function extractMessagesFromSpan(span: Span, level: number = 0): Message[] {
  const attribute = span.attribute as any;
  const messages: Message[] = [];
  // Parse the request JSON to get messages
  const requestStr = attribute?.request || attribute?.input;
  const requestJson = requestStr ? tryParseJson(requestStr) : null;

  if (!requestJson) {
    return messages;
  }


  // Extract messages array from request
  let requestMessages = requestJson?.messages || requestJson?.contents;

  if (!requestMessages || !Array.isArray(requestMessages)) {
    return messages;
  }

  // Also extract the response/output to create an assistant message
  const outputStr = attribute?.output;
  const outputJson = outputStr ? tryParseJson(outputStr) : null;
  const responseContent = extractResponseContent(outputJson, attribute) ;
  // Calculate metrics for this span
  const spanMetrics = calculateSpanMetrics(span);

  // Convert each message in the request
  requestMessages.forEach((msg: any, index: number) => {
    const message: Message = {
      id: `${span.span_id}_msg_${index}`,
      type: msg.role || 'system',
      role: msg.role as 'user' | 'assistant' | 'system',
      content: extractMessageContent(msg),
      content_array: msg.parts || (Array.isArray(msg.content) ? msg.content : undefined),
      timestamp: span.start_time_us / 1000, // Convert to milliseconds
      thread_id: span.thread_id,
      trace_id: span.trace_id,
      span_id: span.span_id,
      span,
      tool_calls: msg.tool_calls,
      tool_call_id: msg.tool_call_id,
      metrics: index === requestMessages.length - 1 ? [spanMetrics] : undefined, // Attach metrics to last message
      level,
    };

    messages.push(message);
  });

  // Add the assistant response message if available
  if (responseContent) {
    const assistantMessage: Message = {
      id: `${span.span_id}_response`,
      type: 'assistant',
      role: 'assistant',
      content: responseContent,
      timestamp: span.finish_time_us ? span.finish_time_us / 1000 : Date.now(), // Use finish time for response
      thread_id: span.thread_id,
      trace_id: span.trace_id,
      span_id: span.span_id,
      span,
      metrics: [spanMetrics],
    };

    messages.push(assistantMessage);
  }

  return messages;
}

/**
 * Extracts content from a message object
 *
 * @param msg - The message object from the request
 * @returns String content for display
 */
function extractMessageContent(msg: any): string {
  // If content is a string, return it directly
  if (typeof msg.content === 'string') {
    return msg.content;
  }

  // If content is an array of parts
  if (Array.isArray(msg.content)) {
    return msg.content
      .map((part: any) => {
        if (typeof part === 'string') return part;
        if (part.text) return part.text;
        if (part.type === 'text' && part.text) return part.text;
        return JSON.stringify(part);
      })
      .join('\n');
  }

  // If content is an object
  if (msg.content && typeof msg.content === 'object') {
    if (msg.content.text) return msg.content.text;
    return JSON.stringify(msg.content);
  }

  // Check parts array
  if (msg.parts && Array.isArray(msg.parts)) {
    return msg.parts
      .map((part: any) => {
        if (typeof part === 'string') return part;
        if (part.text) return part.text;
        return JSON.stringify(part);
      })
      .join('\n');
  }

  return '';
}

/**
 * Extracts response content from the output JSON
 *
 * @param outputJson - Parsed output JSON
 * @param attribute - The span attribute
 * @returns String content for the assistant message
 */
function extractResponseContent(outputJson: any, attribute: any): string | null {
  if (!outputJson) return attribute?.content;

  // Try different fields for response content
  if (outputJson.content) {
    if (typeof outputJson.content === 'string') {
      return outputJson.content;
    }
    if (Array.isArray(outputJson.content)) {
      return outputJson.content
        .map((item: any) => {
          if (typeof item === 'string') return item;
          if (item.text) return item.text;
          return JSON.stringify(item);
        })
        .join('\n');
    }
    return JSON.stringify(outputJson.content);
  }

  if (outputJson.message?.content) {
    return typeof outputJson.message.content === 'string'
      ? outputJson.message.content
      : JSON.stringify(outputJson.message.content);
  }

  if (outputJson.text) {
    return outputJson.text;
  }

  if (outputJson.choices?.[0]?.message?.content) {
    return outputJson.choices[0].message.content;
  }

  if (outputJson.candidates?.[0]?.content) {
    return typeof outputJson.candidates[0].content === 'string'
      ? outputJson.candidates[0].content
      : JSON.stringify(outputJson.candidates[0].content);
  }

  // Fallback to response attribute
  const response = attribute?.response;
  if (response) {
    const responseParsed = tryParseJson(response);
    if (responseParsed && responseParsed.content) {
      return typeof responseParsed.content === 'string'
        ? responseParsed.content
        : JSON.stringify(responseParsed.content);
    }
    return typeof response === 'string' ? response : JSON.stringify(response);
  }

  return null;
}

/**
 * Calculates metrics from span timing and attributes
 *
 * @param span - The span to calculate metrics from
 * @returns MessageMetrics object
 */
function calculateSpanMetrics(span: Span): MessageMetrics {
  const duration = span.finish_time_us ? span.finish_time_us - span.start_time_us : 0;
  const attr = span.attribute as any;

  const usageStr = attr?.usage;
  const costStr = attr?.cost;
  const ttftStr = attr?.ttft;

  const usage = usageStr ? tryParseJson(usageStr) : null;
  const cost = costStr ? tryParseJson(costStr) : null;

  return {
    run_id: span.run_id,
    trace_id: span.trace_id,
    duration: duration / 1000, // Convert to milliseconds
    start_time_us: span.start_time_us,
    usage: usage || undefined,
    cost: cost?.total_cost || cost || undefined,
    ttft: ttftStr ? parseFloat(ttftStr) : undefined,
  };
}

/**
 * Converts hierarchical spans to SpanWithMessages format
 * This preserves the hierarchy while extracting messages
 *
 * @param spans - Array of hierarchical spans
 * @param level - Current hierarchy level
 * @returns Array of SpanWithMessages objects
 */
export function convertSpansToSpanWithMessages(spans: Span[], level: number = 0): SpanWithMessages[] {
  return spans
    .map((span) => {
      const messages = isActualModelCall(span) ? extractMessagesFromSpan(span, level) : [];
      const children = span.spans ? convertSpansToSpanWithMessages(span.spans, level + 1) : [];

      return {
        span_id: span.span_id,
        run_id: span.run_id,
        trace_id: span.trace_id,
        span,
        messages,
        level,
        children: children.length > 0 ? children : undefined,
      };
    })
    .filter((item) => item.messages.length > 0 || (item.children && item.children.length > 0));
}
