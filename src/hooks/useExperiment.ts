import { useState, useEffect } from "react";
import { useRequest } from "ahooks";
import { toast } from "sonner";
import { getSpanById } from "@/services/spans-api";
import { api } from "@/lib/api-client";
import { tryParseJson } from "@/utils/modelUtils";

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
export function useExperiment(spanId: string | null) {
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

  // Run experiment with the current experiment data
  const handleRunExperiment = async () => {
    setRunning(true);
    setResult(""); // Clear previous result

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
    // Actions
    runExperiment: handleRunExperiment,
    addMessage,
    updateMessage,
    updateMessageRole,
    deleteMessage,
    updateExperimentData,
  };
}
