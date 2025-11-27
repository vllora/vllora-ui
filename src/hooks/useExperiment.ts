import { useState, useEffect, useCallback } from "react";
import { useRequest } from "ahooks";
import { toast } from "sonner";
import { getSpanById } from "@/services/spans-api";
import { listRuns, fetchRunSpans } from "@/services/runs-api";
import { api } from "@/lib/api-client";
import { tryParseJson } from "@/utils/modelUtils";
import type { Span } from "@/types/common-type";
import { useDebugControl } from "@/hooks/events/useDebugControl";
import { processEvent } from "@/hooks/events/utilities";
import type { ProjectEventUnion } from "@/contexts/project-events/dto";

// Helper to apply Mustache-style variable substitution ({{variableName}})
function applyMustacheVariables(
  value: unknown,
  variables: Record<string, string>
): unknown {
  if (!variables || Object.keys(variables).length === 0) {
    return value;
  }

  if (typeof value === "string") {
    return value.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return variables[key] !== undefined ? variables[key] : match;
    });
  }

  if (Array.isArray(value)) {
    return value.map((item) => applyMustacheVariables(item, variables));
  }

  if (value !== null && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = applyMustacheVariables(val, variables);
    }
    return result;
  }

  return value;
}

// Content part type for structured/multimodal messages (text, images, audio, files)
export interface MessageContentPart {
  type: "text" | "image_url" | "input_audio" | "file";
  text?: string;
  image_url?: { url: string; detail?: "auto" | "low" | "high" };
  input_audio?: { data: string; format: "wav" | "mp3" };
  file?: { file_data: string; file_id?: string; filename?: string };
}

export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  // Content can be string or array of content parts (for multimodal/structured messages)
  content: string | MessageContentPart[];
  [key: string]: unknown;
}

// Helper to normalize content to string for UI editing
export function normalizeContentToString(
  content: string | MessageContentPart[] | null | undefined
): string {
  if (content === null || content === undefined) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return JSON.stringify(content, null, 2);
  return String(content);
}

export interface ToolFunction {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

export interface Tool {
  type: "function";
  function: ToolFunction;
}

export interface ExperimentData {
  name: string;
  description: string;
  messages: Message[];
  model: string;
  tools?: Tool[];
  tool_choice?: string | { type: "function"; function: { name: string } };
  headers?: Record<string, string>;
  promptVariables?: Record<string, string>;
  stream?: boolean;
  // Allow any additional parameters (model-specific parameters like temperature, max_tokens, etc.)
  [key: string]: unknown;
}

export interface ExperimentResult {
  content: string;
  rawResponse: any;
}

/**
 * Custom hook for managing experiment functionality
 * Handles fetching span data, form state, and running experiments
 */
export function useExperiment(spanId: string | null, projectId: string | null) {
  // Form state
  const [experimentData, setExperimentData] = useState<ExperimentData>({
    name: "Experiment",
    description: "",
    messages: [],
    model: "openai/gpt-4.1-mini",
    headers: {},
    promptVariables: {},
    stream: true,
  });
  // Store the original experiment data from span for comparison
  const [originalExperimentData, setOriginalExperimentData] =
    useState<ExperimentData | null>(null);
  const [result, setResult] = useState<string | object[]>("");
  const [originalOutput, setOriginalOutput] = useState<string | object[]>("");
  const [running, setRunning] = useState(false);
  const [traceId, setTraceId] = useState<string | null>(null);
  const [traceSpans, setTraceSpans] = useState<Span[]>([]);
  const [loadingTraceSpans, setLoadingTraceSpans] = useState(false);

  // Fetch span data
  const {
    data: span,
    loading,
    error,
  } = useRequest(
    async () => {
      if (!spanId) {
        throw new Error("No span ID provided");
      }
      return getSpanById({ spanId });
    },
    {
      ready: !!spanId,
      refreshDeps: [spanId], // Re-fetch when spanId changes
      onError: (err) => {
        toast.error("Failed to load span data", {
          description: err.message || "An error occurred",
        });
      },
    }
  );

  // Parse span data into experiment data
  const parseSpanToExperiment = (span: any): ExperimentData | null => {
    if (!span) return null;

    const attribute = span.attribute || {};

    // Parse request
    let request: any = attribute.request && tryParseJson(attribute.request);

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
  };

  // Initialize experiment data and original output when span loads
  useEffect(() => {
    if (span) {
      const parsedData = parseSpanToExperiment(span);
      if (parsedData) {
        setExperimentData(parsedData);
        // Store original data for comparison (deep clone)
        setOriginalExperimentData(JSON.parse(JSON.stringify(parsedData)));
      }

      // Extract original output
      const attribute = span.attribute || {};
      if (attribute.output) {
        setOriginalOutput(attribute.output );
      }
    }
  }, [span]);

  // Fetch trace spans when traceId changes
  const fetchTraceSpans = useCallback(
    async (traceIdToFetch: string, projectId: string) => {
      setLoadingTraceSpans(true);
      setTraceSpans([]);

      try {
        // First, get runs by trace ID
        const runsResponse = await listRuns({
          projectId,
          params: { trace_ids: traceIdToFetch, limit: 100 },
        });

        if (runsResponse.data.length === 0) {
          return;
        }

        // Fetch spans for each run
        const allSpans: Span[] = [];
        for (const run of runsResponse.data) {
          if (run.run_id) {
            const spansResponse = await fetchRunSpans({
              runId: run.run_id,
              projectId,
              offset: 0,
              limit: 1000,
            });
            allSpans.push(...spansResponse.data);
          }
        }

        setTraceSpans(allSpans);
      } catch (error) {
        console.error("Failed to fetch trace spans:", error);
      } finally {
        setLoadingTraceSpans(false);
      }
    },
    []
  );

  // Run experiment with the current experiment data
  const handleRunExperiment = async () => {
    setRunning(true);
    setResult(""); // Clear previous result
    setTraceId(null); // Clear previous trace
    setTraceSpans([]);

    try {
      // Extract non-API fields from experimentData
      const {
        name,
        description,
        headers,
        promptVariables,
        tools,
        messages,
        ...apiParams
      } = experimentData;

      // Apply Mustache variable substitution if promptVariables has values
      const substitutedHeaders = applyMustacheVariables(
        headers,
        promptVariables || {}
      ) as Record<string, string>;
      const substitutedTools = applyMustacheVariables(
        tools,
        promptVariables || {}
      ) as Tool[] | undefined;
      const substitutedMessages = applyMustacheVariables(
        messages,
        promptVariables || {}
      ) as Message[];

      // Process messages - parse JSON string content back to arrays for API
      const processedMessages = substitutedMessages.map((msg) => {
        // If content is already an array, use as-is
        if (Array.isArray(msg.content)) {
          return msg;
        }
        // If content is undefined/null, keep as-is
        if (msg.content === undefined || msg.content === null) {
          return msg;
        }
        // If content is a string that looks like JSON array, parse it
        const trimmed = String(msg.content).trim();
        if (trimmed.startsWith("[")) {
          try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) {
              return { ...msg, content: parsed };
            }
          } catch {
            // Not valid JSON, keep as string
          }
        }
        return msg;
      });

      const payload = {
        ...apiParams,
        messages: processedMessages,
        ...(substitutedTools &&
          substitutedTools.length > 0 && { tools: substitutedTools }),
      };

      // Extract thread_id from span if available
      const threadId = span?.thread_id;
      const isStreaming = experimentData.stream ?? true;

      const response = await api.post("/v1/chat/completions", payload, {
        headers: {
          "Content-Type": "application/json",
          ...(threadId && { "x-thread-id": threadId }),
          "x-label": "experiment",
          ...substitutedHeaders,
        },
      });

      if (!response.ok) {
        // extract error message from response
        const errorResponse = await response.json();
        throw new Error(errorResponse.error);
      }

      // Extract trace ID from response headers
      const responseTraceId = response.headers.get("x-trace-id");
      if (responseTraceId) {
        setTraceId(responseTraceId);
      }

      if (isStreaming && response.body) {
        // Handle streaming response
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulatedContent = "";
        let buffer = "";
        // Track tool calls: { [index]: { id, name, arguments } }
        const toolCalls: Record<
          number,
          { id: string; name: string; arguments: string }
        > = {};

        const formatOutput = () => {
          const toolCallEntries = Object.values(toolCalls);
          // If there are tool calls, return the full message JSON
          if (toolCallEntries.length > 0) {
            const message: Record<string, unknown> = { role: "assistant" };
            if (accumulatedContent) message.content = accumulatedContent;
            message.tool_calls = toolCallEntries.map((tc) => {
              let args = tc.arguments;
              try {
                args = JSON.parse(tc.arguments);
              } catch {
                // Keep as string if not valid JSON yet
              }
              return {
                id: tc.id,
                type: "function",
                function: { name: tc.name, arguments: args },
              };
            });
            return JSON.stringify(message, null, 2);
          }
          // Otherwise just return the content
          return accumulatedContent;
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; // Keep incomplete line in buffer

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (!trimmedLine || !trimmedLine.startsWith("data:")) continue;

            const data = trimmedLine.slice(5).trim();
            if (data === "[DONE]") continue;

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta;

              // Handle content delta
              if (delta?.content) {
                accumulatedContent += delta.content;
                setResult(formatOutput());
              }

              // Handle tool_calls delta
              if (delta?.tool_calls) {
                for (const tc of delta.tool_calls) {
                  const idx = tc.index ?? 0;
                  if (!toolCalls[idx]) {
                    toolCalls[idx] = { id: "", name: "", arguments: "" };
                  }
                  if (tc.id) toolCalls[idx].id = tc.id;
                  if (tc.function?.name) toolCalls[idx].name = tc.function.name;
                  if (tc.function?.arguments)
                    toolCalls[idx].arguments += tc.function.arguments;
                }
                setResult(formatOutput());
              }
            } catch {
              // Skip invalid JSON chunks
            }
          }
        }

        toast.success("Experiment completed successfully");

        const finalOutput = formatOutput();
        return {
          content: finalOutput,
          rawResponse: null,
        };
      } else {
        // Handle non-streaming response
        const data = await response.json();
        toast.success("Experiment completed successfully");
        setResult(data);

        return {
          content: data,
          rawResponse: data,
        };
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to run experiment";
      toast.error("Failed to run experiment", {
        description: message,
      });
      throw error;
    } finally {
      setRunning(false);
    }
  };

  // Helper functions for message manipulation
  const addMessage = () => {
    setExperimentData({
      ...experimentData,
      messages: [...experimentData.messages, { role: "user", content: "" }],
    });
  };

  const updateMessage = (
    index: number,
    content: string | MessageContentPart[]
  ) => {
    const newMessages = [...experimentData.messages];
    newMessages[index].content = content;
    setExperimentData({ ...experimentData, messages: newMessages });
  };

  const updateMessageRole = (index: number, role: Message["role"]) => {
    const newMessages = [...experimentData.messages];
    newMessages[index].role = role;
    setExperimentData({ ...experimentData, messages: newMessages });
  };

  const deleteMessage = (index: number) => {
    const newMessages = experimentData.messages.filter((_, i) => i !== index);
    setExperimentData({ ...experimentData, messages: newMessages });
  };

  const updateExperimentData = (updates: Partial<ExperimentData>) => {
    setExperimentData({ ...experimentData, ...updates });
  };

  // Reset experiment to original state
  const resetExperiment = useCallback(() => {
    if (originalExperimentData) {
      setExperimentData(JSON.parse(JSON.stringify(originalExperimentData)));
    }
    setResult("");
    setTraceId(null);
    setTraceSpans([]);
  }, [originalExperimentData]);

  // Wrapper to fetch trace spans with project ID
  const loadTraceSpans = useCallback(() => {
    if (traceId && projectId && !loadingTraceSpans && traceSpans.length === 0) {
      // Add delay to ensure backend has flushed traces (flushes every 1 second)
      setTimeout(() => {
        fetchTraceSpans(traceId, projectId);
      }, 1500);
    }
  }, [
    traceId,
    projectId,
    loadingTraceSpans,
    traceSpans.length,
    fetchTraceSpans,
  ]);

  // Handle real-time events for the experiment's thread
  const handleEvent = useCallback(
    (event: ProjectEventUnion) => {
      // Only process events that match the original span's thread_id
      const originalThreadId = span?.thread_id;
      if (!originalThreadId || event.thread_id !== originalThreadId) {
        return;
      }

      // Update traceSpans with the new event
      setTraceSpans((prevSpans) => processEvent(prevSpans, event));
    },
    [span?.thread_id]
  );

  // Subscribe to real-time events for the experiment
  useDebugControl({
    handleEvent,
    channel_name: "debug-experiment-events",
  });

  return {
    // Span data
    span,
    loading,
    error,
    // Form state
    experimentData,
    originalExperimentData,
    result,
    originalOutput,
    running,
    // Trace data
    traceId,
    traceSpans,
    loadingTraceSpans,
    // Actions
    runExperiment: handleRunExperiment,
    addMessage,
    updateMessage,
    updateMessageRole,
    deleteMessage,
    updateExperimentData,
    loadTraceSpans,
    resetExperiment,
  };
}
