import { Clock, Pencil, WrenchIcon } from 'lucide-react';
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
import { ProviderIcon } from '@/components/Icons/ProviderIcons';
import { ChatWindowConsumer } from '@/contexts/ChatWindowContext';
import { ThreadsConsumer } from '@/contexts/ThreadsContext';
import { useRelativeTime } from '@/hooks/useRelativeTime';
import { ToolCallList } from './ToolCallList';
import { parseJsonWithNestedResult } from '@/utils/modelUtils';
import { JsonViewer } from '../traces/TraceRow/span-info/JsonViewer';

export const ToolMessage: React.FC<{
    message?: Message;
    isTyping?: boolean;
}> = ({ message: msg, isTyping }) => {
    const { setOpenTraces, fetchSpansByRunId, setHoveredRunId } = ChatWindowConsumer();
    const { setIsRightSidebarCollapsed } = ThreadsConsumer();
    const parsedContent = useMemo(
        () => typeof msg?.content === 'string' ? parseJsonWithNestedResult(msg.content) : undefined,
        [msg?.content]
    );
    const messageRef = React.useRef<HTMLDivElement>(null);

    // Only update relative time when message is visible and less than 60 seconds old
    useRelativeTime(messageRef, msg?.created_at);

    const metrics = msg?.metrics;
    const canClickToOpenTrace = useMemo(() => {
        
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
        if (!canClickToOpenTrace || !metrics || !Array.isArray(metrics) || metrics.length === 0) return;
        const runId = metrics[0]?.run_id;
        if (!runId) return;

        // Open the trace and fetch spans
        setOpenTraces((prev)=> {
            let isOpen = prev.find(t => t.run_id === runId);
            if (isOpen) {
                return prev.filter(t => t.run_id !== runId);
            } else {
                return [...prev, { run_id: runId, tab: 'trace' }];
            }
        });
        fetchSpansByRunId(runId);
        // Auto-expand the right sidebar
        setIsRightSidebarCollapsed(false);
    }, [canClickToOpenTrace, metrics, setOpenTraces, fetchSpansByRunId, setIsRightSidebarCollapsed]);

    const handleMouseEnter = useCallback(() => {
        if (metrics && Array.isArray(metrics) && metrics.length > 0) {
            const runId = metrics[0]?.run_id;
            if (runId) {
                setHoveredRunId(runId);
            }
        }
    }, [metrics, setHoveredRunId]);

    const handleMouseLeave = useCallback(() => {
        setHoveredRunId(null);
    }, [setHoveredRunId]);

    return (
        <div
            ref={messageRef}
            className={`flex flex-col gap-2 group ${canClickToOpenTrace ? 'cursor-pointer hover:bg-neutral-800/30 rounded-lg p-2 -m-2 transition-colors' : ''}`}
            onClick={canClickToOpenTrace ? handleOpenTrace : undefined}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            {/* Header with Avatar and Metadata */}
            {msg?.model_name && <div className="flex items-center gap-3">
                <div className="flex-shrink-0">
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger>
                                { msg?.type === "tool" ? (
                                   <div className="h-6 w-6 rounded-full border border-neutral-800 flex items-center justify-center text-white">
                                        <WrenchIcon className="h-3 w-3" />
                                    </div>
                                ) : msg?.model_name ? (
                                    <ProviderIcon
                                        provider_name={providerName}
                                        className="h-6 w-6 rounded-full"
                                    />
                                ) : (
                                    <AvatarItem
                                        className="h-6 w-6 rounded-full"
                                        name={'Assistant'}
                                    />
                                )}
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
                <div className="flex items-center gap-2 flex-1">
                    <span className="text-neutral-300 font-medium text-sm">{ msg?.type === "tool" ? "Tool" : msg?.model_name ? msg.model_name : 'Assistant'}</span>
                    {msg?.timestamp && (
                                <div className="flex items-center text-xs text-neutral-500">
                                  <Clock className="h-3 w-3 mr-1" />
                                  <span>{formatMessageTimestamp(msg.timestamp)}</span>
                                </div>
                    )}
                    {canClickToOpenTrace && (
                        <span className="text-[10px] text-blue-400/60 px-1.5 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">Click to view trace details</span>
                    )}
                </div>
            </div>}

            {/* Content */}
            <div className="w-full">
                {msg?.tool_calls && msg.tool_calls.length > 0 && (
                    <ToolCallList toolCalls={msg.tool_calls} />
                )}
                {msg?.type === "tool" && msg?.tool_call_id && (
                    <div className="mb-3 rounded-md overflow-hidden bg-neutral-900/20 border border-neutral-800/40">
                        <div className="px-2 py-1 bg-neutral-800/20">
                            <span className="text-xs text-neutral-500">
                              Tool Call ID: {msg.tool_call_id}
                            </span>
                        </div>
                        <div className="px-2 py-2">
                            <div className="whitespace-normal text-neutral-100 break-words overflow-wrap break-all text-sm">
                              {parsedContent ? <JsonViewer data={parsedContent} /> : <MessageDisplay message={msg?.content || ""} />}
                            </div>
                        </div>
                    </div>
                )}
                {msg?.type !== "tool" && (
                    msg?.content_array && msg.content_array.length > 0 ? (
                        <ContentArrayDisplay contentArray={msg.content_array} />
                    ) : (
                        <div className="whitespace-normal text-neutral-100 break-words overflow-wrap break-all leading-relaxed text-sm">
                            <MessageDisplay message={msg?.content || ""} />
                        </div>
                    )
                )}

            </div>

            {isTyping && (
                <div className="rounded bg-neutral-800/20 px-2 py-1.5 flex items-center gap-2 mt-2 border border-neutral-800/30">
                    <Pencil className="h-3.5 w-3.5 text-neutral-400 animate-pulse" />
                    <span className="text-xs text-neutral-400">Thinking...</span>
                </div>
            )}
        </div>
    );
};
