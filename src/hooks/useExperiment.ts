import { useState, useEffect, useCallback, useMemo } from "react";
import { useRequest } from "ahooks";
import { toast } from "sonner";
import { getSpanById } from "@/services/spans-api";
import { listRuns, fetchRunSpans } from "@/services/runs-api";
import { api } from "@/lib/api-client";
import { applyMustacheVariables } from "@/utils/templateUtils";
import {
  parseSpanToExperiment,
  extractOriginalInfo,
} from "@/utils/experimentUtils";
import type { Span } from "@/types/common-type";
import { useDebugControl } from "@/hooks/events/useDebugControl";
import { processEvent } from "@/hooks/events/utilities";
import type { ProjectEventUnion } from "@/contexts/project-events/dto";
import type {
  ExperimentData,
  Message,
  MessageContentPart,
  Tool,
} from "@/types/experiment";

// Re-export types for backward compatibility
export type {
  MessageContentPart,
  Message,
  ToolFunction,
  Tool,
  ExperimentData,
  ExperimentResult,
} from "@/types/experiment";

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
  const [resultInfo, setResultInfo] = useState({
    usage: "",
    cost: "",
    model: "",
  });
  const [running, setRunning] = useState(false);
  const [traceId, setTraceId] = useState<string | null>(null);
  const [traceSpans, setTraceSpans] = useState<Span[]>([]);
  const [loadingTraceSpans, setLoadingTraceSpans] = useState(false);


  useEffect(()=> {
    if(traceSpans && traceSpans.length > 0) {
      const newApiInvokeSpan = traceSpans.find((span) => span.operation_name === 'api_invoke');
      if(newApiInvokeSpan && newApiInvokeSpan.attribute) {
         let apiAtt = newApiInvokeSpan.attribute as any;
        apiAtt && setResultInfo(prev => {
          return {
            ...prev,
            usage: apiAtt.usage || '',
            cost: apiAtt.cost || ''
          }
         })
        
      }
    }
  }, [traceSpans])

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

  const originalInfo = useMemo(() => extractOriginalInfo(span), [span]);

  // Initialize experiment data and original output when span loads
  useEffect(() => {
    if (span) {
      const parsedData = parseSpanToExperiment(span);
      if (parsedData) {
        setExperimentData(parsedData);
        // Store original data for comparison (deep clone)
        setOriginalExperimentData(JSON.parse(JSON.stringify(parsedData)));
      }
    }
  }, [span]);

  const refreshSpansByRunId = useCallback(
    async (runId: string) => {
      if(!projectId) return;
      const spansResponse = await fetchRunSpans({
        runId: runId,
        projectId,
        offset: 0,
        limit: 1000,
      });
      let newSpans = spansResponse.data;
      setTraceSpans(prev => {
        // for each newSpans, check if it is in prev, if not, add it, if exist, update it
        let updatedSpans = [...prev];
        for (const span of newSpans) {
          const index = updatedSpans.findIndex((s) => s.span_id === span.span_id);
          if (index === -1) {
            updatedSpans.push(span);
          } else {
            updatedSpans[index] = span;
          }
        }
        // sort updatedSpans by span_id
        updatedSpans.sort((a, b) => a.start_time_us - b.start_time_us);
        return updatedSpans;
      });
    },
    [projectId]
  );
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
    setResultInfo({
      usage: "",
      cost: "",
      model: "",
    });
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
              const usage = parsed && parsed.usage;
              if (usage) {
                setResultInfo({
                  usage: usage,
                  cost: usage.cost || "",
                  model: payload.model,
                });
              }
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

        data.usage &&
          setResultInfo({
            usage: data.usage,
            cost: data.usage.cost || "",
            model: payload.model,
          });

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
    setResultInfo({
      usage: "",
      cost: "",
      model: "",
    });
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
      if (event.type === "RunFinished" && event.run_id) {
       event.run_id && setTimeout(() => {
          refreshSpansByRunId(event.run_id || '');
        }, 1500);
      }
    },
    [span?.thread_id, projectId]
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
    originalInfo,
    resultInfo,
  };
}
