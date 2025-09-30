import React from 'react';
import { Clock, Zap, MessageSquare, ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TraceStep {
  id: string;
  timestamp: number;
  type: 'request' | 'response' | 'tool_call' | 'system';
  title: string;
  duration?: number;
  details?: Record<string, any>;
}

interface ChatRightSidebarProps {
  threadId: string;
  traces: TraceStep[];
  isCollapsed?: boolean;
  onToggle?: () => void;
}

export const ChatRightSidebar: React.FC<ChatRightSidebarProps> = ({
  threadId,
  traces,
  isCollapsed = false,
  onToggle,
}) => {
  const [expandedTraces, setExpandedTraces] = React.useState<Set<string>>(new Set());

  const toggleTrace = (traceId: string) => {
    setExpandedTraces((prev) => {
      const next = new Set(prev);
      if (next.has(traceId)) {
        next.delete(traceId);
      } else {
        next.add(traceId);
      }
      return next;
    });
  };

  const formatTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const getTraceIcon = (type: TraceStep['type']) => {
    switch (type) {
      case 'request':
        return <MessageSquare className="w-4 h-4 text-blue-500" />;
      case 'response':
        return <MessageSquare className="w-4 h-4 text-theme-500" />;
      case 'tool_call':
        return <Zap className="w-4 h-4 text-yellow-500" />;
      case 'system':
        return <Clock className="w-4 h-4 text-muted-foreground" />;
    }
  };

  return (
    <div className={`bg-card border-l border-border flex flex-col h-full transition-all duration-300 ${isCollapsed ? 'w-12' : 'w-80'}`}>
      {/* Header */}
      <div className="h-[88px] p-4 border-b border-border flex items-center justify-between">
        {!isCollapsed && (
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-foreground">Traces</h2>
            <p className="text-xs text-muted-foreground mt-1">
              {traces.length} event{traces.length !== 1 ? 's' : ''}
            </p>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className="hover:bg-accent transition-all duration-200 flex-shrink-0"
        >
          {isCollapsed ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Traces List */}
      {!isCollapsed && (
        <div className="flex-1 overflow-y-auto">
          {traces.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground text-sm">
              No traces yet. Send a message to see traces.
            </div>
          ) : (
          <div className="p-2 space-y-2">
            {traces.map((trace) => {
              const isExpanded = expandedTraces.has(trace.id);
              return (
                <div
                  key={trace.id}
                  className="border border-border rounded-lg overflow-hidden bg-background/50"
                >
                  {/* Trace Header */}
                  <button
                    onClick={() => toggleTrace(trace.id)}
                    className="w-full p-3 flex items-start gap-3 hover:bg-accent/50 transition-colors text-left"
                  >
                    <div className="mt-0.5">{getTraceIcon(trace.type)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <h3 className="text-sm font-medium text-foreground truncate">
                          {trace.title}
                        </h3>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatTime(trace.timestamp)}
                        </span>
                        {trace.duration && (
                          <span className="flex items-center gap-1">
                            <Zap className="w-3 h-3" />
                            {formatDuration(trace.duration)}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>

                  {/* Trace Details */}
                  {isExpanded && trace.details && (
                    <div className="px-3 pb-3 border-t border-border/50">
                      <pre className="text-xs text-muted-foreground bg-muted/30 p-2 rounded mt-2 overflow-x-auto">
                        {JSON.stringify(trace.details, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        </div>
      )}
    </div>
  );
};