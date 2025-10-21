import {
  AgentStartedEvent,
  TaskStartedEvent,
  CustomEvent,
  CustomSpanStartEventType,
  CustomSpanEndEventType,
  RunStartedEvent,
  StepStartedEvent,
  TextMessageStartEvent,
  ToolCallStartEvent,
  ProjectEventUnion,
  CustomLlmStartEventType,
  CustomLlmStopEventType,
  CustomCostEventType,
} from "@/contexts/project-events/dto";
import { RunDTO, Span } from "@/types/common-type";
import { SpanMap } from "../../useSpanDetails";
import { convertSpanToRun, getDataFromSpan } from "@/utils/span-converter";

/**
 * Utility functions to convert various event types to Span objects
 */

export const convertAgentStartedToSpan = (event: AgentStartedEvent): Span => {
  return {
    span_id: event.span_id || `agent_${Date.now()}`,
    parent_span_id: event.parent_span_id,
    operation_name: "agent",
    thread_id: event.thread_id || "",
    run_id: event.run_id || "",
    trace_id: "",
    start_time_us: event.timestamp * 1000,
    finish_time_us: undefined,
    attribute: event.name ? { "langdb.agent_name": event.name } : {},
    isInProgress: true,
  };
};

export const convertTaskStartedToSpan = (event: TaskStartedEvent): Span => {
  return {
    span_id: event.span_id || `task_${Date.now()}`,
    parent_span_id: event.parent_span_id,
    operation_name: "task",
    thread_id: event.thread_id || "",
    run_id: event.run_id || "",
    trace_id: "",
    start_time_us: event.timestamp * 1000,
    finish_time_us: undefined,
    attribute: event.name ? { "langdb.task_name": event.name } : {},
    isInProgress: true,
  };
};

export const convertCustomSpanStartToSpan = (
  event: CustomEvent,
  spanStart: CustomSpanStartEventType
): Span => {
  return {
    span_id: event.span_id || `span_${Date.now()}`,
    parent_span_id: event.parent_span_id,
    operation_name: spanStart.operation_name,
    thread_id: event.thread_id || "",
    run_id: event.run_id || "",
    trace_id: "",
    start_time_us: event.timestamp * 1000,
    finish_time_us: undefined,
    attribute: spanStart.attributes || {},
    isInProgress: true,
  };
};

export const convertCustomSpanEndToSpan = (
  event: CustomEvent,
  spanEnd: CustomSpanEndEventType
): Span => {
  return {
    span_id: event.span_id || "",
    parent_span_id: event.parent_span_id,
    operation_name: spanEnd.operation_name,
    thread_id: event.thread_id || "",
    run_id: event.run_id || "",
    trace_id: "",
    start_time_us: spanEnd.start_time_unix_nano / 1000,
    finish_time_us: spanEnd.finish_time_unix_nano / 1000,
    attribute: spanEnd.attributes || {},
    isInProgress: false,
  };
};

export const convertRunStartedToSpan = (event: RunStartedEvent): Span => {
  return {
    span_id: event.span_id || event.run_id || `run_${Date.now()}`,
    parent_span_id: event.parent_span_id,
    operation_name: "run",
    thread_id: event.thread_id || "",
    run_id: event.run_id || "",
    trace_id: "",
    start_time_us: event.timestamp * 1000,
    finish_time_us: undefined,
    attribute: {},
    isInProgress: true,
  };
};

export const convertStepStartedToSpan = (event: StepStartedEvent): Span => {
  return {
    span_id: event.span_id || `step_${Date.now()}`,
    parent_span_id: event.parent_span_id,
    operation_name: "step",
    thread_id: event.thread_id || "",
    run_id: event.run_id || "",
    trace_id: "",
    start_time_us: event.timestamp * 1000,
    finish_time_us: undefined,
    attribute: { "langdb.step_name": event.step_name },
    isInProgress: true,
  };
};

export const convertTextMessageStartToSpan = (
  event: TextMessageStartEvent
): Span => {
  return {
    span_id: event.span_id || `text_message_${Date.now()}`,
    parent_span_id: event.parent_span_id,
    operation_name: "text_message",
    thread_id: event.thread_id || "",
    run_id: event.run_id || "",
    trace_id: "",
    start_time_us: event.timestamp * 1000,
    finish_time_us: undefined,
    attribute: { role: event.role },
    isInProgress: true,
  };
};

export const convertToolCallStartToSpan = (event: ToolCallStartEvent): Span => {
  return {
    span_id: event.span_id || event.tool_call_id || `tool_call_${Date.now()}`,
    parent_span_id: event.parent_span_id,
    operation_name: "tool_call",
    thread_id: event.thread_id || "",
    run_id: event.run_id || "",
    trace_id: "",
    start_time_us: event.timestamp * 1000,
    finish_time_us: undefined,
    attribute: {
      tool_call_id: event.tool_call_id,
      tool_call_name: event.tool_call_name,
    },
    isInProgress: true,
  };
};


const createNewRun = (run_id: string): RunDTO => {
  let run: RunDTO = {
    run_id: run_id,
    thread_ids: [],
    trace_ids: [],
    root_span_ids: [],
    start_time_us: 0,
    finish_time_us: 0,
    cost: 0,
    input_tokens: 0,
    output_tokens: 0,
    errors: [],
    used_models: [],
    request_models: [],
    used_tools: [],
    mcp_template_definition_ids: []
   }  
   return run;
}
export const updatedRunWithSpans = ({
  spans,
  prevRun,
  run_id
}: {
  spans: Span[];
  prevRun?: RunDTO;
  run_id: string;
}): RunDTO => {
  if(!spans || spans.length === 0) return createNewRun(run_id);
  let processRun = prevRun || createNewRun(run_id);
  processRun.cost = 0;
  processRun.input_tokens = 0;
  processRun.output_tokens = 0;
  processRun.errors = [];
  spans.forEach(span => {
    let {cost, inputTokens, outputTokens, errors} = getDataFromSpan(span);
    processRun.cost += cost;
    processRun.input_tokens += inputTokens;
    processRun.output_tokens += outputTokens;
    processRun.errors = [...processRun.errors, ...errors];
  })
  if(processRun.start_time_us === 0){
    processRun.start_time_us = spans[0].start_time_us;
  }
  if(!processRun.finish_time_us && spans[spans.length - 1].finish_time_us){
    processRun.finish_time_us = spans[spans.length - 1].finish_time_us!;
  }
  return processRun;
};



export function processEventWithSpanMap(spanMap: SpanMap, event: ProjectEventUnion): SpanMap {
   if(event.run_id){
    let spansByRunId = spanMap[event.run_id];
    if(!spansByRunId){
      spansByRunId = [];
    }
     spanMap[event.run_id] = processEvent(spansByRunId, event);
   }
   return spanMap;
}

/**
 * Pure function to process a single event and return updated spans array
 * This function doesn't mutate state - it returns a new array based on the event type
 */
export const processEvent = (
  currentSpans: Span[],
  event: ProjectEventUnion
): Span[] => {
  const timestamp = event.timestamp || Date.now();
  // === Run Lifecycle Events ===
  if (event.type === "RunStarted") {
    const span = convertRunStartedToSpan(event);
    return [...currentSpans, span];
  }

  if (event.type === "RunFinished" || event.type === "RunError") {
    const spanId = event.span_id || event.run_id;
    if (!spanId) return currentSpans;

    const existingIndex = currentSpans.findIndex((s) => s.span_id === spanId);
    if (existingIndex === -1) return currentSpans;

    const updated = [...currentSpans];
    updated[existingIndex] = {
      ...updated[existingIndex],
      finish_time_us: timestamp * 1000,
      isInProgress: false,
      ...(event.type === "RunError" && {
        attribute: {
          ...updated[existingIndex].attribute,
          error: event.message,
          error_code: event.code,
        },
      }),
    };
    return updated;
  }

  // === Agent/Task/Step Lifecycle Events ===
  if (event.type === "AgentStarted") {
    const span = convertAgentStartedToSpan(event);
    return [...currentSpans, span];
  }

  if (event.type === "TaskStarted") {
    const span = convertTaskStartedToSpan(event);
    return [...currentSpans, span];
  }

  if (event.type === "StepStarted") {
    const span = convertStepStartedToSpan(event);
    return [...currentSpans, span];
  }

  if (
    event.type === "AgentFinished" ||
    event.type === "TaskFinished" ||
    event.type === "StepFinished"
  ) {
    if (!event.span_id) return currentSpans;

    const existingIndex = currentSpans.findIndex(
      (s) => s.span_id === event.span_id
    );
    if (existingIndex === -1) return currentSpans;

    const updated = [...currentSpans];
    updated[existingIndex] = {
      ...updated[existingIndex],
      finish_time_us: timestamp * 1000,
      isInProgress: false,
    };
    return updated;
  }

  // === Text Message Events ===
  if (event.type === "TextMessageStart") {
    if (!event.span_id) return currentSpans;
    let textMessageStartEvent: TextMessageStartEvent =
      event as TextMessageStartEvent;
    if (!textMessageStartEvent) return currentSpans;
    // check if span exists
    const existingIndex = currentSpans.findIndex(
      (s) => s.span_id === event.span_id
    );
    if (existingIndex >= 0) {
      const updated = [...currentSpans];
      const attr = updated[existingIndex].attribute as any;
      const currentContent = attr.content || "";
      updated[existingIndex] = {
        ...updated[existingIndex],
        attribute: {
          ...updated[existingIndex].attribute,
          content: currentContent,
        } as any,
      };
      return updated;
    } else {
      // Create new span if it doesn't exist
      const newSpan: Span = {
        span_id: event.span_id,
        parent_span_id: event.parent_span_id,
        operation_name: "text_message",
        thread_id: event.thread_id || "",
        run_id: event.run_id || "",
        trace_id: "",
        start_time_us: timestamp * 1000,
        finish_time_us: undefined,
        attribute: {} as any,
        isInProgress: true,
      };
      return [...currentSpans, newSpan];
    }
  }

  if (event.type === "TextMessageContent") {
    if (!event.span_id) return currentSpans;

    const existingIndex = currentSpans.findIndex(
      (s) => s.span_id === event.span_id
    );
    if (existingIndex >= 0) {
      const updated = [...currentSpans];
      const attr = updated[existingIndex].attribute as any;
      const currentContent = attr.content || "";
      updated[existingIndex] = {
        ...updated[existingIndex],
        finish_time_us: timestamp * 1000,
        attribute: {
          ...updated[existingIndex].attribute,
          content: currentContent + event.delta,
        } as any,
      };
      return updated;
    } else {
      // Create new span if it doesn't exist
      const newSpan: Span = {
        span_id: event.span_id,
        parent_span_id: event.parent_span_id,
        operation_name: "text_message",
        thread_id: event.thread_id || "",
        run_id: event.run_id || "",
        trace_id: "",
        start_time_us: timestamp * 1000,
        finish_time_us: timestamp * 1000,
        attribute: { content: event.delta } as any,
        isInProgress: true,
      };
      return [...currentSpans, newSpan];
    }
  }

  if (event.type === "TextMessageEnd") {
    if (!event.span_id) return currentSpans;

    const existingIndex = currentSpans.findIndex(
      (s) => s.span_id === event.span_id
    );
    if (existingIndex === -1) return currentSpans;

    const updated = [...currentSpans];
    updated[existingIndex] = {
      ...updated[existingIndex],
      finish_time_us: timestamp * 1000,
      isInProgress: false,
    };
    return updated;
  }

  // === Tool Call Events ===
  if (event.type === "ToolCallStart") {
    const span = convertToolCallStartToSpan(event);
    return [...currentSpans, span];
  }

  if (event.type === "ToolCallArgs") {
    const spanId = event.span_id || event.tool_call_id;
    if (!spanId) return currentSpans;

    const existingIndex = currentSpans.findIndex((s) => s.span_id === spanId);
    if (existingIndex >= 0) {
      const updated = [...currentSpans];
      const attr = updated[existingIndex].attribute as any;
      const currentArgs = attr.tool_arguments || "";
      updated[existingIndex] = {
        ...updated[existingIndex],
        attribute: {
          ...updated[existingIndex].attribute,
          tool_arguments: currentArgs + event.delta,
        } as any,
      };
      return updated;
    } else {
      // Create new span if it doesn't exist
      const newSpan: Span = {
        span_id: spanId,
        parent_span_id: event.parent_span_id,
        operation_name: "tool_call",
        thread_id: event.thread_id || "",
        run_id: event.run_id || "",
        trace_id: "",
        start_time_us: timestamp * 1000,
        finish_time_us: undefined,
        attribute: {
          tool_call_id: event.tool_call_id,
          tool_arguments: event.delta,
        } as any,
        isInProgress: true,
      };
      return [...currentSpans, newSpan];
    }
  }

  if (event.type === "ToolCallEnd") {
    const spanId = event.span_id || event.tool_call_id;
    if (!spanId) return currentSpans;

    const existingIndex = currentSpans.findIndex((s) => s.span_id === spanId);
    if (existingIndex === -1) return currentSpans;

    const updated = [...currentSpans];
    updated[existingIndex] = {
      ...updated[existingIndex],
      finish_time_us: timestamp * 1000,
      isInProgress: false,
    };
    return updated;
  }

  if (event.type === "ToolCallResult") {
    const spanId = event.span_id || event.tool_call_id;
    if (!spanId) return currentSpans;

    const existingIndex = currentSpans.findIndex((s) => s.span_id === spanId);
    if (existingIndex >= 0) {
      const updated = [...currentSpans];
      updated[existingIndex] = {
        ...updated[existingIndex],
        attribute: {
          ...updated[existingIndex].attribute,
          result: event.content,
          result_role: event.role,
        },
      };
      return updated;
    } else {
      // Create new span if it doesn't exist
      const newSpan: Span = {
        span_id: spanId,
        parent_span_id: event.parent_span_id,
        operation_name: "tool_call",
        thread_id: event.thread_id || "",
        run_id: event.run_id || "",
        trace_id: "",
        start_time_us: timestamp * 1000,
        finish_time_us: undefined,
        attribute: {
          tool_call_id: event.tool_call_id,
          result: event.content,
          result_role: event.role,
        } as any,
        isInProgress: true,
      };
      return [...currentSpans, newSpan];
    }
  }

  // === State Management Events ===
  if (event.type === "StateSnapshot") {
    if (!event.span_id) return currentSpans;

    const existingIndex = currentSpans.findIndex(
      (s) => s.span_id === event.span_id
    );
    if (existingIndex >= 0) {
      const updated = [...currentSpans];
      updated[existingIndex] = {
        ...updated[existingIndex],
        trace_id: event.snapshot.trace_id,
        finish_time_us: timestamp * 1000,
        isInProgress: false,
      };
      return updated;
    } else {
      // Create new span if it doesn't exist
      const newSpan: Span = {
        span_id: event.span_id,
        parent_span_id: event.parent_span_id,
        operation_name: "span",
        thread_id: event.thread_id || "",
        run_id: event.run_id || "",
        start_time_us: timestamp * 1000,
        finish_time_us: timestamp * 1000,
        trace_id: event.snapshot.trace_id,
        isInProgress: false,
        attribute: {} as any,
      };
      return [...currentSpans, newSpan];
    }
  }

  if (event.type === "StateDelta") {
    if (!event.span_id) return currentSpans;

    const existingIndex = currentSpans.findIndex(
      (s) => s.span_id === event.span_id
    );
    if (existingIndex >= 0) {
      const updated = [...currentSpans];
      updated[existingIndex] = {
        ...updated[existingIndex],
        attribute: {
          ...updated[existingIndex].attribute,
          state_delta: event.delta,
        },
      };
      return updated;
    } else {
      // Create new span if it doesn't exist
      const newSpan: Span = {
        span_id: event.span_id,
        parent_span_id: event.parent_span_id,
        operation_name: "span",
        thread_id: event.thread_id || "",
        run_id: event.run_id || "",
        trace_id: "",
        start_time_us: timestamp * 1000,
        finish_time_us: undefined,
        attribute: {
          state_delta: event.delta,
        } as any,
        isInProgress: true,
      };
      return [...currentSpans, newSpan];
    }
  }

  if (event.type === "MessagesSnapshot") {
    if (!event.span_id) return currentSpans;

    const existingIndex = currentSpans.findIndex(
      (s) => s.span_id === event.span_id
    );
    if (existingIndex >= 0) {
      const updated = [...currentSpans];
      updated[existingIndex] = {
        ...updated[existingIndex],
        attribute: {
          ...updated[existingIndex].attribute,
          messages_snapshot: event.messages,
        },
      };
      return updated;
    } else {
      // Create new span if it doesn't exist
      const newSpan: Span = {
        span_id: event.span_id,
        parent_span_id: event.parent_span_id,
        operation_name: "span",
        thread_id: event.thread_id || "",
        run_id: event.run_id || "",
        trace_id: "",
        start_time_us: timestamp * 1000,
        finish_time_us: undefined,
        attribute: {
          messages_snapshot: event.messages,
        } as any,
        isInProgress: true,
      };
      return [...currentSpans, newSpan];
    }
  }

  // === Special Events ===
  if (event.type === "Raw") {
    if (!event.span_id) return currentSpans;

    const existingIndex = currentSpans.findIndex(
      (s) => s.span_id === event.span_id
    );
    if (existingIndex >= 0) {
      const updated = [...currentSpans];
      updated[existingIndex] = {
        ...updated[existingIndex],
        attribute: {
          ...updated[existingIndex].attribute,
          raw_event: event.event,
          raw_event_source: event.source,
        },
      };
      return updated;
    } else {
      // Create new span if it doesn't exist
      const newSpan: Span = {
        span_id: event.span_id,
        parent_span_id: event.parent_span_id,
        operation_name: "raw",
        thread_id: event.thread_id || "",
        run_id: event.run_id || "",
        trace_id: "",
        start_time_us: timestamp * 1000,
        finish_time_us: undefined,
        attribute: {
          raw_event: event.event,
          raw_event_source: event.source,
        } as any,
        isInProgress: true,
      };
      return [...currentSpans, newSpan];
    }
  }

  // Handle Custom events
  if (event.type === "Custom") {
    const customEvent = event as CustomEvent;
    const customEventSpanId = event.span_id;

    // Handle Custom events with typed event field
    if ("event" in customEvent && customEvent.event) {
      const eventType = customEvent.event;
      // Handle span_start
      if (eventType.type === "span_start") {
        const span = convertCustomSpanStartToSpan(customEvent, eventType);
        return [...currentSpans, span];
      }

      // Handle span_end
      if (eventType.type === "span_end") {
        const span = convertCustomSpanEndToSpan(customEvent, eventType);
        const existingIndex = currentSpans.findIndex(
          (s) => s.span_id === span.span_id
        );
        if (existingIndex >= 0) {
          // Update existing in-progress span
          const updated = [...currentSpans];
          updated[existingIndex] = span;
          return updated;
        } else {
          // Add new completed span
          return [...currentSpans, span];
        }
      }

      if (eventType.type === "llm_start") {
        if (!customEventSpanId) return currentSpans;
        let llmStartEvent: CustomLlmStartEventType =
          eventType as CustomLlmStartEventType;
        if (!llmStartEvent) return currentSpans;

        const existingIndex = currentSpans.findIndex(
          (s) => s.span_id === customEventSpanId
        );
        if (existingIndex >= 0) {
          // Update existing in-progress span
          const updated = [...currentSpans];
          updated[existingIndex] = {
            ...updated[existingIndex],
            attribute: {
              ...updated[existingIndex].attribute,
              model_name: llmStartEvent.model_name,
              input: llmStartEvent.input,
            },
          };
          return updated;
        } else {
          let newSpanFromLLMStart: Span = {
            span_id: customEventSpanId,
            parent_span_id: event.parent_span_id,
            operation_name: llmStartEvent.provider_name,
            thread_id: event.thread_id || "",
            run_id: event.run_id || "",
            trace_id: "",
            start_time_us: timestamp * 1000,
            finish_time_us: undefined,
            attribute: {
              ...llmStartEvent,
            } as any,
            isInProgress: true,
          };
          // Add new completed span
          return [...currentSpans, newSpanFromLLMStart];
        }
      }
      if (eventType.type === "llm_stop") {
        if (!customEventSpanId) return currentSpans;
        let llmStopEvent: CustomLlmStopEventType =
          eventType as CustomLlmStopEventType;
        if (!llmStopEvent) return currentSpans;

        const existingIndex = currentSpans.findIndex(
          (s) => s.span_id === customEventSpanId
        );
        if (existingIndex >= 0) {
          // Update existing in-progress span
          const updated = [...currentSpans];
          updated[existingIndex] = {
            ...updated[existingIndex],
            finish_time_us: timestamp * 1000,
            isInProgress: false,
          };
          return updated;
        } else {
          let newSpanFromLLMStop: Span = {
            span_id: customEventSpanId,
            parent_span_id: event.parent_span_id,
            operation_name: "llm_stop",
            thread_id: event.thread_id || "",
            run_id: event.run_id || "",
            trace_id: "",
            start_time_us: timestamp * 1000,
            finish_time_us: timestamp * 1000,
            attribute: {
              ...llmStopEvent,
            } as any,
            isInProgress: false,
          };
          // Add new completed span
          return [...currentSpans, newSpanFromLLMStop];
        }
      }
      if(eventType.type === "cost") {
        if (!customEventSpanId) return currentSpans;
        let costEvent: CustomCostEventType =
          eventType as CustomCostEventType;
        if (!costEvent) return currentSpans;

        const existingIndex = currentSpans.findIndex(
          (s) => s.span_id === customEventSpanId
        );
        if (existingIndex >= 0) {
          // Update existing in-progress span
          const updated = [...currentSpans];
          updated[existingIndex] = {
            ...updated[existingIndex],
            finish_time_us: timestamp * 1000,
            isInProgress: false,
            attribute: {
              ...updated[existingIndex].attribute,
              ...costEvent.value,
            },
          };
          return updated;
        } else {
          let newSpanFromCost: Span = {
            span_id: customEventSpanId,
            parent_span_id: event.parent_span_id,
            operation_name: "cost",
            thread_id: event.thread_id || "",
            run_id: event.run_id || "",
            trace_id: "",
            start_time_us: timestamp * 1000,
            finish_time_us: undefined,
            attribute: {
              ...costEvent.value,
            } as any,
            isInProgress: true,
          };
          // Add new completed span
          return [...currentSpans, newSpanFromCost];
        }
      }

      // Handle ping events (ignore them)
      if (eventType.type === "ping") {
        return currentSpans;
      }

      // Unknown custom event type - log warning but don't crash
      console.warn(
        `===== [processEvent] not process event type:`,
        eventType,
        customEvent
      );
      return currentSpans;
    }
  }

  // No matching event type - return unchanged
  return currentSpans;
};
