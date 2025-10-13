import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { DebugEvent } from '@/hooks/events/useDebugEvents';
import { cn } from '@/lib/utils';

interface EventItemProps {
  event: DebugEvent;
}

// Get color based on event type
const getEventTypeColor = (type: string): string => {
  const colorMap: Record<string, string> = {
    RunStarted: 'bg-green-500/20 text-green-400 border-green-500/30',
    RunFinished: 'bg-green-600/20 text-green-300 border-green-600/30',
    RunError: 'bg-red-500/20 text-red-400 border-red-500/30',
    TextMessageStart: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    TextMessageContent: 'bg-blue-400/20 text-blue-300 border-blue-400/30',
    TextMessageEnd: 'bg-blue-600/20 text-blue-300 border-blue-600/30',
    ToolCallStart: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    ToolCallArgs: 'bg-purple-400/20 text-purple-300 border-purple-400/30',
    ToolCallEnd: 'bg-purple-600/20 text-purple-300 border-purple-600/30',
    ToolCallResult: 'bg-purple-700/20 text-purple-200 border-purple-700/30',
    StepStarted: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    StepFinished: 'bg-yellow-600/20 text-yellow-300 border-yellow-600/30',
    StateSnapshot: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    StateDelta: 'bg-cyan-400/20 text-cyan-300 border-cyan-400/30',
    MessagesSnapshot: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',
    Custom: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
    Raw: 'bg-gray-600/20 text-gray-300 border-gray-600/30',
  };
  return colorMap[type] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';
};

// Format timestamp
const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  const timeStr = date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const ms = date.getMilliseconds().toString().padStart(3, '0');
  return `${timeStr}.${ms}`;
};

// Get event summary text
const getEventSummary = (debugEvent: DebugEvent): string => {
  const event = debugEvent.event;
  switch (event.type) {
    case 'RunStarted':
      return `Run started: ${event.run_id?.substring(0, 8)}...`;
    case 'RunFinished':
      return `Run finished: ${event.run_id?.substring(0, 8)}...`;
    case 'RunError':
      return `Run error: ${event.message}`;
    case 'TextMessageStart':
      return `Message started (${event.role})`;
    case 'TextMessageContent':
      return `Message content: ${event.delta?.substring(0, 50)}${event.delta && event.delta.length > 50 ? '...' : ''}`;
    case 'TextMessageEnd':
      return `Message ended`;
    case 'ToolCallStart':
      return `Tool call: ${event.tool_call_name}`;
    case 'ToolCallArgs':
      return `Tool args: ${event.delta?.substring(0, 40)}...`;
    case 'ToolCallEnd':
      return `Tool call ended: ${event.tool_call_id?.substring(0, 8)}...`;
    case 'ToolCallResult':
      return `Tool result: ${event.content?.substring(0, 40)}...`;
    case 'StepStarted':
      return `Step started: ${event.step_name}`;
    case 'StepFinished':
      return `Step finished: ${event.step_name}`;
    case 'Custom':
      return `Custom: ${event.name}`;
    default:
      return event.type;
  }
};

export const EventItem: React.FC<EventItemProps> = ({ event: debugEvent }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const event = debugEvent.event;

  return (
    <div className="border-b border-border/50 hover:bg-accent/5 transition-colors">
      <div
        className="flex items-start gap-2 p-3 cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* Expand/Collapse Icon */}
        <div className="flex-shrink-0 mt-0.5">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
        </div>

        {/* Timestamp */}
        <div className="flex-shrink-0 font-mono text-xs text-muted-foreground w-24">
          {formatTime(event.timestamp || debugEvent.receivedAt)}
        </div>

        {/* Event Type Badge */}
        <div
          className={cn(
            'flex-shrink-0 px-2 py-0.5 rounded text-xs font-medium border',
            getEventTypeColor(event.type)
          )}
        >
          {event.type}
        </div>

        {/* Event Summary */}
        <div className="flex-1 text-sm text-foreground/90 truncate">
          {getEventSummary(debugEvent)}
        </div>

        {/* IDs */}
        <div className="flex-shrink-0 flex gap-2 text-xs font-mono">
          {event.thread_id && (
            <span className="text-muted-foreground">
              T:{event.thread_id.substring(0, 6)}
            </span>
          )}
          {event.run_id && (
            <span className="text-muted-foreground">
              R:{event.run_id.substring(0, 6)}
            </span>
          )}
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="px-3 pb-3 pl-11">
          <div className="bg-muted/30 rounded p-3 font-mono text-xs overflow-x-auto">
            <pre className="text-foreground/80">
              {JSON.stringify(debugEvent, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
