import {
  CustomEvent,
  TextMessageStartEvent,
  ProjectEventUnion,
  CustomLlmStartEventType,
  CustomLlmStopEventType,
  CustomCostEventType,
  CustomBreakpointEventType,
} from "@/contexts/project-events/dto";
import { RunDTO, Span } from "@/types/common-type";
import { RunMap } from "../../useSpanDetails";
import { getDataFromSpan } from "@/utils/span-converter";
import { handleRunStartedEvent } from "./run-started";
import { handleRunFinishedErrorEvent } from "./run-finished-error";
import { handleTaskStartedEvent } from "./task-started";
import { handleAgentStartedEvent } from "./agent-started";
import { handleStepStartedEvent } from "./step-started";
import { handleAgentTaskStepFinishedEvent } from "./agent-task-step-finished";
import { handleTextMessageStartedEvent } from "./text-message-started";
import { handleTextMessageContentEvent } from "./text-message-content";
import { handleTextMessageEndedEvent } from "./text-message-ended";
import { handleToolCallStartedEvent } from "./tool-call-started";
import { handleToolCallArgsEvent } from "./tool-call-args";
import { handleToolCallEndEvent } from "./tool-call-end";
import { handleToolCallResultEvent } from "./tool-call-result";
import { handleStateSnapshotEvent } from "./state-snapshot";
import { handleMessagesSnapshotEvent } from "./messages-snapshot";
import { handleRawEvent } from "./raw-event";
import { handleCustomSpanStartEvent } from "./custom-span-start";
import { handleCustomSpanEndEvent } from "./custom-span-end";
import { handleCustomLlmStartEvent } from "./custom-llm-start";
import { handleCustomLlmStopEvent } from "./custom-llm-stop";
import { handleCustomCostEvent } from "./custom-cost";
import { handleBreakpointEvent } from "./breakpoint";
import { handleBreakpointResumeEvent } from "./breakpoint-resume";

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

export const createNewRun = (run_id: string): RunDTO => {
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
    mcp_template_definition_ids: [],
  };
  return run;
};
export const updatedRunWithSpans = ({
  spans,
  prevRun,
  run_id,
}: {
  spans: Span[];
  prevRun?: RunDTO;
  run_id: string;
}): RunDTO => {
  if (!spans || spans.length === 0) return createNewRun(run_id);
  let processRun = prevRun || createNewRun(run_id);
  processRun.cost = 0;
  processRun.input_tokens = 0;
  processRun.output_tokens = 0;
  processRun.errors = [];
  spans
    .sort((a, b) => a.start_time_us - b.start_time_us)
    .forEach((span) => {
      let { cost, inputTokens, outputTokens, errors } = getDataFromSpan(span);
      processRun.cost += cost;
      processRun.input_tokens += inputTokens;
      processRun.output_tokens += outputTokens;
      processRun.errors = [...processRun.errors, ...errors];
    });
  if (processRun.start_time_us === 0) {
    processRun.start_time_us = spans[0].start_time_us;
  }
  // finish_time_us should be the max finish_time_us of spans
  processRun.finish_time_us = spans.reduce(
    (max, span) =>
      span.finish_time_us || 0 > max ? span.finish_time_us || 0 : max,
    0
  );
  return processRun;
};

export function processEventWithRunMap(
  runMap: RunMap,
  event: ProjectEventUnion
): RunMap {
  if (event.run_id) {
    let spansByRunId = runMap[event.run_id];
    if (!spansByRunId) {
      spansByRunId = [];
    }
    runMap[event.run_id] = processEvent(spansByRunId, event);
  }
  return runMap;
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
    return handleRunStartedEvent(currentSpans, event);
  }

  if (event.type === "RunFinished" || event.type === "RunError") {
    return handleRunFinishedErrorEvent(currentSpans, event);
  }

  // === Agent/Task/Step Lifecycle Events ===
  if (event.type === "AgentStarted") {
    return handleAgentStartedEvent(currentSpans, event);
  }

  if (event.type === "TaskStarted") {
    return handleTaskStartedEvent(currentSpans, event);
  }

  if (event.type === "StepStarted") {
    return handleStepStartedEvent(currentSpans, event);
  }

  if (
    event.type === "AgentFinished" ||
    event.type === "TaskFinished" ||
    event.type === "StepFinished"
  ) {
    return handleAgentTaskStepFinishedEvent(currentSpans, event);
  }

  // === Text Message Events ===
  if (event.type === "TextMessageStart") {
    return handleTextMessageStartedEvent(currentSpans, event);
  }

  if (event.type === "TextMessageContent") {
    return handleTextMessageContentEvent(currentSpans, event);
  }

  if (event.type === "TextMessageEnd") {
    return handleTextMessageEndedEvent(currentSpans, event);
  }

  // === Tool Call Events ===
  if (event.type === "ToolCallStart") {
    return handleToolCallStartedEvent(currentSpans, event);
  }

  if (event.type === "ToolCallArgs") {
    return handleToolCallArgsEvent(currentSpans, event);
  }

  if (event.type === "ToolCallEnd") {
    return handleToolCallEndEvent(currentSpans, event);
  }

  if (event.type === "ToolCallResult") {
    return handleToolCallResultEvent(currentSpans, event);
  }

  // === State Management Events ===
  if (event.type === "StateSnapshot") {
    return handleStateSnapshotEvent(currentSpans, event);
  }

  if (event.type === "MessagesSnapshot") {
    return handleMessagesSnapshotEvent(currentSpans, event, timestamp);
  }

  // === Special Events ===
  if (event.type === "Raw") {
    return handleRawEvent(currentSpans, event, timestamp);
  }

  // Handle Custom events
  if (event.type === "Custom") {
    const customEvent = event as CustomEvent;

    // Handle Custom events with typed event field
    if ("event" in customEvent && customEvent.event) {
      const eventType = customEvent.event;
      // Handle span_start
      if (eventType.type === "span_start") {
        return handleCustomSpanStartEvent(currentSpans, customEvent, eventType);
      }

      // Handle span_end
      if (eventType.type === "span_end") {
        return handleCustomSpanEndEvent(currentSpans, customEvent, eventType);
      }

      if (eventType.type === "llm_start") {
        let llmStartEvent: CustomLlmStartEventType =
          eventType as CustomLlmStartEventType;
        return handleCustomLlmStartEvent(
          currentSpans,
          customEvent,
          llmStartEvent,
          timestamp
        );
      }
      if (eventType.type === "llm_stop") {
        let llmStopEvent: CustomLlmStopEventType =
          eventType as CustomLlmStopEventType;
        return handleCustomLlmStopEvent(
          currentSpans,
          customEvent,
          llmStopEvent,
          timestamp
        );
      }
      if (eventType.type === "cost") {
        let costEvent: CustomCostEventType = eventType as CustomCostEventType;
        return handleCustomCostEvent(
          currentSpans,
          customEvent,
          costEvent,
          timestamp
        );
      }

      // Handle ping events (ignore them)
      if (eventType.type === "ping") {
        return currentSpans;
      }

      // Handle breakpoint event - set isInDebug to true
      if (eventType.type === "breakpoint") {
        const breakpointEvent = eventType as CustomBreakpointEventType;
        return handleBreakpointEvent(
          currentSpans,
          customEvent,
          breakpointEvent,
          timestamp
        );
      }

      // Handle breakpoint_resume event - set isInDebug to false
      if (eventType.type === "breakpoint_resume") {
        return handleBreakpointResumeEvent(currentSpans, customEvent);
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
