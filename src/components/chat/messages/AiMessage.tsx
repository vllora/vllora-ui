import { Clock, Pencil } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { AvatarItem } from './AvatarItem';
import { Message } from '@/types/chat';
import React, { useCallback, useMemo } from 'react';
import { MessageDisplay } from '../MessageDisplay';
import { ContentArrayDisplay } from './ContentArrayDisplay';
import { formatMessageTimestamp } from '@/utils/dateUtils';
import { MessageMetrics } from './MessageMetrics';
import { ProviderIcon } from '@/components/Icons/ProviderIcons';
import { ChatWindowConsumer } from '@/contexts/ChatWindowContext';
import { ThreadsConsumer } from '@/contexts/ThreadsContext';
import { useRelativeTime } from '@/hooks/useRelativeTime';
import { ToolCallList } from './ToolCallList';

export const AiMessage: React.FC<{
  message?: Message;
  isTyping?: boolean;
}> = ({ message: msg, isTyping }) => {
  const { setOpenTraces, fetchSpansByRunId, setSelectedSpanId, setHoverSpanId } = ChatWindowConsumer();
  const { setIsRightSidebarCollapsed } = ThreadsConsumer();
  const messageRef = React.useRef<HTMLDivElement>(null);

  // Only update relative time when message is visible and less than 60 seconds old
  useRelativeTime(messageRef, msg?.created_at);

  const canClickToHighlightTraces = useMemo(() => {
     if(msg?.span_id && msg?.span?.run_id){
      return true;
     }
     return false;
  }, [msg]);

  // Extract provider name from model_name (e.g., "openai/gpt-4" -> "openai")
  const getProviderName = (modelName?: string) => {
    if (!modelName) return 'default';
    const parts = modelName.split('/');
    return parts.length > 1 ? parts[0] : 'default';
  };

  const providerName = getProviderName(msg?.model_name);

  const handleOpenTrace = useCallback(() => {
    const runId = msg?.span?.run_id;
    const spanId = msg?.span_id;
    if (!runId || !spanId) return;
    setSelectedSpanId(spanId);

    // Open the trace and fetch spans
    setOpenTraces([{ run_id: runId, tab: 'trace' }]);
    fetchSpansByRunId(runId);
    // Auto-expand the right sidebar
    setIsRightSidebarCollapsed(false);
  }, [msg?.span?.run_id, setOpenTraces, fetchSpansByRunId, setIsRightSidebarCollapsed]);

  const handleMouseEnter = useCallback(() => {
    if(msg?.span_id){
      setHoverSpanId(msg.span_id);
    }
  }, [msg?.span_id]);

  const handleMouseLeave = useCallback(() => {
    setHoverSpanId(undefined);
  }, []);

  return (
    <div
      ref={messageRef}
      className={`flex flex-col gap-3 group ${canClickToHighlightTraces ? 'cursor-pointer hover:bg-neutral-800/20 rounded-lg p-2 -m-2 transition-colors' : ''}`}
      onClick={canClickToHighlightTraces ? handleOpenTrace : undefined}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Header with Avatar and Metadata */}
      {msg?.model_name && <div className="flex items-center gap-3">
        <div className="flex-shrink-0">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div className="relative">
                  {msg?.model_name ? (
                    <ProviderIcon
                      provider_name={providerName}
                      className="h-7 w-7 rounded-full"
                    />
                  ) : (
                    <AvatarItem
                      className="h-7 w-7 rounded-full"
                      name={'Assistant'}
                    />
                  )}
                </div>
              </TooltipTrigger>
              <TooltipContent>
                <p>
                  {msg?.model_name ? `Model: ${msg.model_name}` : 'AI Message'}
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Metadata */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-neutral-300 font-medium text-sm truncate">{msg?.model_name.includes('/') ? msg.model_name.split('/')[1] : (msg.model_name || 'Assistant')}</span>
          {msg?.timestamp && (
            <div className="flex items-center text-xs text-neutral-500 shrink-0">
              <Clock className="h-3 w-3 mr-1" />
              <span>{formatMessageTimestamp(msg.timestamp)}</span>
            </div>
          )}
          {canClickToHighlightTraces && (
            <span className="text-[10px] text-blue-400/60 px-1.5 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">Click to view trace details</span>
          )}
        </div>
      </div>}

      {/* Content */}
      <div className="w-full">
        {msg?.tool_calls && msg.tool_calls.length > 0 && (
          <ToolCallList toolCalls={msg.tool_calls} />
        )}
        {msg?.type === "tool" && msg?.tool_call_id && (
          <div className="mb-3 rounded-lg overflow-hidden bg-neutral-900/30 border border-neutral-800/50">
            <div className="px-3 py-1.5 bg-neutral-800/30">
              <span className="text-xs text-neutral-500">
                ID: {msg.tool_call_id}
              </span>
            </div>
            <div className="px-4 py-3">
              <div className="whitespace-normal text-neutral-200 break-words overflow-wrap break-all text-sm">
                <MessageDisplay message={msg?.content || ""} />
              </div>
            </div>
          </div>
        )}
        {msg?.type !== "tool" && (
          msg?.content_array && msg.content_array.length > 0 ? (
            <ContentArrayDisplay contentArray={msg.content_array} />
          ) : (
            <div className="whitespace-normal text-neutral-200 break-words overflow-wrap break-all leading-relaxed text-sm">
              <MessageDisplay message={msg?.content || ""} />
            </div>
          )
        )}

      </div>

      {/* Footer with Metrics */}
      {msg && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <MessageMetrics message={msg} />
        </div>
      )}

      {isTyping && (
        <div className="rounded-lg bg-neutral-900/30 px-3 py-2 flex items-center gap-2 border border-neutral-800/50">
          <Pencil className="h-3.5 w-3.5 text-neutral-400 animate-pulse" />
          <span className="text-xs text-neutral-400">Thinking...</span>
        </div>
      )}
    </div>
  );
};
