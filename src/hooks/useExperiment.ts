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

export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
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
  const [result, setResult] = useState<string>("");
  const [originalOutput, setOriginalOutput] = useState<string>("");
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

    // Extract messages
    const messages: Message[] = request?.messages || [];

    // extract tools
    const tools: Tool[] = request?.tools || [];

    return {
      name: `Experiment: ${span.operation_name}`,
      description: `Based on span ${span.span_id}`,
      messages,
      tools,
      model: request.model || "gpt-4",
      headers: {},
      promptVariables: {},
      stream: request.stream ?? true,
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
        try {
          const outputStr =
            typeof attribute.output === "string"
              ? attribute.output
              : JSON.stringify(attribute.output);
          const outputObj = JSON.parse(outputStr);
          setOriginalOutput(
            outputObj.choices?.[0]?.message?.content ||
              JSON.stringify(outputObj)
          );
        } catch (e) {
          setOriginalOutput(
            typeof attribute.output === "string"
              ? attribute.output
              : JSON.stringify(attribute.output)
          );
        }
      }
    }
  }, [span]);

  // Fetch trace spans when traceId changes
  const fetchTraceSpans = useCallback(async (traceIdToFetch: string, projectId: string) => {
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
  }, []);

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
        ...apiParams
      } = experimentData;

      const payload = {
        ...apiParams,
        ...(tools && tools.length > 0 && { tools }),
      };

      // Extract thread_id from span if available
      const threadId = span?.thread_id;
      const isStreaming = experimentData.stream ?? true;

      const response = await api.post("/v1/chat/completions", payload, {
        headers: {
          "Content-Type": "application/json",
          ...(threadId && { "x-thread-id": threadId }),
          "x-label": "experiment",
          ...headers,
        },
      });

      if (!response.ok) {
        throw new Error("Failed to run experiment");
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
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                accumulatedContent += delta;
                setResult(accumulatedContent);
              }
            } catch {
              // Skip invalid JSON chunks
            }
          }
        }

        toast.success("Experiment completed successfully");

        return {
          content: accumulatedContent,
          rawResponse: null,
        };
      } else {
        // Handle non-streaming response
        const data = await response.json();
        const content =
          data.choices?.[0]?.message?.content || JSON.stringify(data);

        toast.success("Experiment completed successfully");
        setResult(content);

        return {
          content,
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

  const updateMessage = (index: number, content: string) => {
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

  // Wrapper to fetch trace spans with project ID
  const loadTraceSpans = useCallback(() => {
    if (traceId && projectId && !loadingTraceSpans && traceSpans.length === 0) {
      // Add delay to ensure backend has flushed traces (flushes every 1 second)
      setTimeout(() => {
        fetchTraceSpans(traceId, projectId);
      }, 1500);
    }
  }, [traceId, projectId, loadingTraceSpans, traceSpans.length, fetchTraceSpans]);

  // Handle real-time events for the experiment's thread
  const handleEvent = useCallback((event: ProjectEventUnion) => {
    // Only process events that match the original span's thread_id
    const originalThreadId = span?.thread_id;
    if (!originalThreadId || event.thread_id !== originalThreadId) {
      return;
    }

    // Update traceSpans with the new event
    setTraceSpans(prevSpans => processEvent(prevSpans, event));
  }, [span?.thread_id]);

  // Subscribe to real-time events for the experiment
  useDebugControl({
    handleEvent,
    channel_name: 'debug-experiment-events',
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
  };
}
