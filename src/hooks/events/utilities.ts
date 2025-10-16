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
} from '@/contexts/project-events/dto';
import { Span } from '@/types/common-type';

/**
 * Utility functions to convert various event types to Span objects
 */

export const convertAgentStartedToSpan = (event: AgentStartedEvent): Span => {
  return {
    span_id: event.span_id || `agent_${Date.now()}`,
    parent_span_id: event.parent_span_id,
    operation_name: 'agent',
    thread_id: event.thread_id || '',
    run_id: event.run_id || '',
    trace_id: '',
    start_time_us: event.timestamp * 1000,
    finish_time_us: undefined,
    attribute: event.name ? { 'langdb.agent_name': event.name } : {},
    isInProgress: true,
  };
};

export const convertTaskStartedToSpan = (event: TaskStartedEvent): Span => {
  return {
    span_id: event.span_id || `task_${Date.now()}`,
    parent_span_id: event.parent_span_id,
    operation_name: 'task',
    thread_id: event.thread_id || '',
    run_id: event.run_id || '',
    trace_id: '',
    start_time_us: event.timestamp * 1000,
    finish_time_us: undefined,
    attribute: event.name ? { 'langdb.task_name': event.name } : {},
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
    thread_id: event.thread_id || '',
    run_id: event.run_id || '',
    trace_id: '',
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
    span_id: event.span_id || '',
    parent_span_id: event.parent_span_id,
    operation_name: spanEnd.operation_name,
    thread_id: event.thread_id || '',
    run_id: event.run_id || '',
    trace_id: '',
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
    operation_name: 'run',
    thread_id: event.thread_id || '',
    run_id: event.run_id || '',
    trace_id: '',
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
    operation_name: 'step',
    thread_id: event.thread_id || '',
    run_id: event.run_id || '',
    trace_id: '',
    start_time_us: event.timestamp * 1000,
    finish_time_us: undefined,
    attribute: { 'langdb.step_name': event.step_name },
    isInProgress: true,
  };
};

export const convertTextMessageStartToSpan = (event: TextMessageStartEvent): Span => {
  return {
    span_id: event.span_id || `text_message_${Date.now()}`,
    parent_span_id: event.parent_span_id,
    operation_name: 'text_message',
    thread_id: event.thread_id || '',
    run_id: event.run_id || '',
    trace_id: '',
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
    operation_name: 'tool_call',
    thread_id: event.thread_id || '',
    run_id: event.run_id || '',
    trace_id: '',
    start_time_us: event.timestamp * 1000,
    finish_time_us: undefined,
    attribute: {
      tool_call_id: event.tool_call_id,
      tool_call_name: event.tool_call_name,
    },
    isInProgress: true,
  };
};
