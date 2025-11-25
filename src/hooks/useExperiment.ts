import { useState, useEffect } from 'react';
import { useRequest } from 'ahooks';
import { toast } from 'sonner';
import { getSpanById } from '@/services/spans-api';
import { api } from '@/lib/api-client';

export interface Message {
  role: "system" | "user" | "assistant";
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
  temperature: number;
  max_tokens?: number;
  tools?: Tool[];
  tool_choice?: string | { type: "function"; function: { name: string } };
  headers?: Record<string, string>;
  promptVariables?: Record<string, string>;
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
    model: "gpt-4",
    temperature: 0.7,
    headers: {},
    promptVariables: {},
  });
  const [result, setResult] = useState<string>("");
  const [originalOutput, setOriginalOutput] = useState<string>("");
  const [running, setRunning] = useState(false);

  // Fetch span data
  const { data: span, loading, error } = useRequest(
    async () => {
      if (!spanId) {
        throw new Error('No span ID provided');
      }
      return getSpanById({ spanId });
    },
    {
      ready: !!spanId,
      onError: (err) => {
        toast.error('Failed to load span data', {
          description: err.message || 'An error occurred',
        });
      },
    }
  );

  // Parse span data into experiment data
  const parseSpanToExperiment = (span: any): ExperimentData | null => {
    if (!span) return null;

    const attribute = span.attribute || {};

    // Parse request
    let request: any = {};
    if (attribute.request) {
      try {
        request = JSON.parse(attribute.request);
      } catch (e) {
        console.error('Failed to parse request:', e);
      }
    }

    // Extract messages
    const messages: Message[] = request.messages || [];

    return {
      name: `Experiment: ${span.operation_name}`,
      description: `Based on span ${span.span_id}`,
      messages,
      model: request.model || 'gpt-4',
      temperature: request.temperature || 0.7,
      max_tokens: request.max_tokens,
      headers: {},
      promptVariables: {},
    };
  };

  // Initialize experiment data and original output when span loads
  useEffect(() => {
    if (span) {
      const parsedData = parseSpanToExperiment(span);
      if (parsedData) {
        setExperimentData(parsedData);
      }

      // Extract original output
      const attribute = span.attribute || {};
      if (attribute.output) {
        try {
          const outputStr = typeof attribute.output === 'string'
            ? attribute.output
            : JSON.stringify(attribute.output);
          const outputObj = JSON.parse(outputStr);
          setOriginalOutput(outputObj.choices?.[0]?.message?.content || JSON.stringify(outputObj));
        } catch (e) {
          setOriginalOutput(typeof attribute.output === 'string' ? attribute.output : JSON.stringify(attribute.output));
        }
      }
    }
  }, [span]);

  // Run experiment with the current experiment data
  const handleRunExperiment = async () => {
    setRunning(true);
    try {
      const payload = {
        model: experimentData.model,
        messages: experimentData.messages,
        temperature: experimentData.temperature,
        ...(experimentData.max_tokens && { max_tokens: experimentData.max_tokens }),
      };

      const response = await api.post('/v1/chat/completions', payload, {
        headers: {
          'Content-Type': 'application/json',
          ...experimentData.headers,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to run experiment');
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || JSON.stringify(data);

      toast.success('Experiment completed successfully');
      setResult(content);

      return {
        content,
        rawResponse: data,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to run experiment';
      toast.error('Failed to run experiment', {
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
    result,
    originalOutput,
    running,
    // Actions
    runExperiment: handleRunExperiment,
    addMessage,
    updateMessage,
    deleteMessage,
    updateExperimentData,
  };
}
