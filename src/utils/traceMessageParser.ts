import { Message, MessageType, MessageContentType, MessageMetrics } from '@/types/chat';
import { Span } from '@/services/runs-api';

/**
 * Extracts usage metrics from a span
 */
function extractUsageFromSpan(span: Span): any | null {
  try {
    // Check child_attribute first (most common location for usage data)
    if (span.child_attribute && 'usage' in span.child_attribute) {
      const usageStr = span.child_attribute.usage as string;
      if (typeof usageStr === 'string') {
        return JSON.parse(usageStr);
      }
    }

    // Check attribute for usage data
    if (span.attribute && 'usage' in span.attribute) {
      const usageStr = span.attribute.usage as string;
      if (typeof usageStr === 'string') {
        return JSON.parse(usageStr);
      }
    }

    // Check for cost in child_attribute
    if (span.child_attribute && 'cost' in span.child_attribute) {
      const costStr = span.child_attribute.cost as string;
      if (typeof costStr === 'string') {
        return JSON.parse(costStr);
      }
    }
  } catch (error) {
    console.warn('Failed to parse usage from span:', span.span_id, error);
  }
  return null;
}

/**
 * Parses messages from trace span data
 * Extracts user messages from attribute.request and AI responses from attribute.response
 */
export function parseMessagesFromTraces(spans: Span[]): Message[] {
  const messages: Message[] = [];
  
  for (const span of spans) {
    // Look for spans with api_invoke operation that contain request/response data
    if (span.operation_name === 'api_invoke' && span.attribute) {
      try {
        // Parse the request to extract user messages
        if ('request' in span.attribute && typeof span.attribute.request === 'string') {
          const requestData = JSON.parse(span.attribute.request);
          if (requestData.messages && Array.isArray(requestData.messages)) {
            // Extract user messages from the request
            requestData.messages.forEach((msg: any, index: number) => {
              if (msg.role === 'user' && msg.content) {
                messages.push({
                  id: `${span.span_id}-user-${index}`,
                  type: MessageType.HumanMessage,
                  role: 'user',
                  content: msg.content,
                  timestamp: span.start_time_us / 1000, // Convert microseconds to milliseconds
                  content_type: MessageContentType.Text,
                  thread_id: span.thread_id,
                  trace_id: span.trace_id,
                  run_id: span.run_id,
                  model_name: requestData.model,
                });
              }
            });
          }
        }

        // Parse the response to extract AI messages
        if ('response' in span.attribute && typeof span.attribute.response === 'string') {
          const responseContent = span.attribute.response;
          if (responseContent) {
            // Extract usage metrics for this message
            const usage = extractUsageFromSpan(span);
            const metrics: MessageMetrics[] = usage ? [{
              run_id: span.run_id,
              trace_id: span.trace_id,
              usage: {
                input_tokens: usage.input_tokens || usage.prompt_tokens || 0,
                output_tokens: usage.output_tokens || usage.completion_tokens || 0,
                cost: usage.cost || 0,
              },
              cost: usage.cost || 0,
            }] : [];

            messages.push({
              id: `${span.span_id}-assistant`,
              type: MessageType.AIMessage,
              role: 'assistant',
              content: responseContent,
              timestamp: span.finish_time_us / 1000, // Convert microseconds to milliseconds
              content_type: MessageContentType.Text,
              thread_id: span.thread_id,
              trace_id: span.trace_id,
              run_id: span.run_id,
              model_name: span.attribute && 'model_name' in span.attribute 
                ? span.attribute.model_name as string 
                : undefined,
              metrics,
            });
          }
        }
      } catch (error) {
        console.warn('Failed to parse messages from span:', span.span_id, error);
      }
    }

    // Also check child_attribute for additional message data
    if (span.child_attribute) {
      try {
        if ('output' in span.child_attribute && typeof span.child_attribute.output === 'string') {
          // This might contain the AI response
          const outputContent = span.child_attribute.output;
          if (outputContent && outputContent !== '{}') {
            // Check if this is a JSON string that needs parsing
            let parsedOutput = outputContent;
            try {
              const parsed = JSON.parse(outputContent);
              if (typeof parsed === 'string') {
                parsedOutput = parsed;
              }
            } catch {
              // If it's not JSON, use as is
            }

            messages.push({
              id: `${span.span_id}-output`,
              type: MessageType.AIMessage,
              role: 'assistant',
              content: parsedOutput,
              timestamp: span.finish_time_us / 1000,
              content_type: MessageContentType.Text,
              thread_id: span.thread_id,
              trace_id: span.trace_id,
              run_id: span.run_id,
              model_name: span.child_attribute && 'model_name' in span.child_attribute 
                ? span.child_attribute.model_name as string 
                : undefined,
            });
          }
        }
      } catch (error) {
        console.warn('Failed to parse child attribute from span:', span.span_id, error);
      }
    }
  }

  // Sort messages by timestamp
  return messages.sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Extracts messages from a specific run's spans
 */
export function extractMessagesFromRun(runId: string, spanMap: Record<string, Span[]>): Message[] {
  const spans = spanMap[runId] || [];
  return parseMessagesFromTraces(spans);
}

/**
 * Extracts all messages from all runs in a thread
 */
export function extractAllMessagesFromThread(spanMap: Record<string, Span[]>): Message[] {
  const allSpans: Span[] = [];
  
  // Flatten all spans from all runs
  Object.values(spanMap).forEach(spans => {
    allSpans.push(...spans);
  });
  
  return parseMessagesFromTraces(allSpans);
}

