import { tryParseJson } from "@/utils/modelUtils";
import type { ExperimentData, Message, Tool } from "@/types/experiment";

/**
 * Parse span data into experiment data
 * Pure function that transforms span attributes into ExperimentData format
 */
export function parseSpanToExperiment(span: any): ExperimentData | null {
  if (!span) return null;

  const attribute = span.attribute || {};

  // Parse request
  const request: any = attribute.request && tryParseJson(attribute.request);

  // Extract messages - preserve ALL properties including original content type
  const rawMessages = request?.messages || [];
  const messages: Message[] = rawMessages.map((msg: any) => ({
    ...msg, // Preserve all properties: role, content, tool_calls, tool_call_id, name, refusal, etc.
  }));

  // Extract known fields, spread the rest (model parameters, etc.)
  const {
    model,
    messages: _messages,
    tools: requestTools,
    ...restParams
  } = request || {};

  const tools: Tool[] = requestTools || [];

  return {
    name: `Experiment`,
    description: `Based on span ${span.span_id}`,
    messages,
    tools,
    model: model || "openai/gpt-4o-mini",
    headers: {},
    promptVariables: {},
    stream: restParams.stream ?? true,
    // Include all other parameters from the original request (temperature, max_tokens, etc.)
    ...restParams,
  };
}

/**
 * Extract original info from span for display
 * Pure function that extracts output and usage from span attributes
 */
export function extractOriginalInfo(span: any): { content: string | object[]; usage: string, cost: string, model: string } | null {
  if (!span) return null;
  const attribute: any = span?.attribute || {};
  const request = attribute?.request;
  const requestJson = request && tryParseJson(request);
  const model = requestJson?.model;
   return {
    content: attribute?.output || attribute?.response || "",
    usage: attribute?.usage || "",
    cost: attribute?.cost || "",
    model: model || ''
  };
}
