import { useEffect, useRef, useState } from "react";
import { MarkdownViewer } from "./markdown-viewer";
import { JsonViewer } from "../JsonViewer";
import { DatabaseIcon, ChevronDown, ChevronUp } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { tryParseJson } from "@/utils/modelUtils";
import { ToolCallList } from "@/components/chat/messages/ToolCallList";

export const SingleMessage = (props: { role: string, content?: string, objectContent?: any, toolCalls?: any[], isFirst?: boolean, isLast?: boolean, parts?: any, tool_call_id?: string }) => {
    const { role, content, objectContent, toolCalls, parts, tool_call_id } = props;

    const [isExpanded, setIsExpanded] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);
    const [showExpandButton, setShowExpandButton] = useState(false);

    const getRoleLabel = () => {
        const normalizedRole = role?.toLowerCase?.() || '';
        const fallback = role ? `${role.charAt(0).toUpperCase()}${role.slice(1)}` : 'Message';
        switch (normalizedRole) {
            case 'tool':
                return 'Tool';
            case 'assistant':
                return 'Assistant';
            case 'system':
                return 'System';
            case 'ai':
                return 'AI';
            case 'user':
                return 'User';
            case 'model':
                return 'Model';
            default:
                return fallback;
        }
    };

    const roleLabel = getRoleLabel();

    const parsedContent = typeof content === 'string' ? tryParseJson(content) : undefined;

    const partsArray = Array.isArray(parts) ? parts : [];
    const textSegments: string[] = [];
    const seenText = new Set<string>();
    const registerTextSegment = (segment?: string) => {
        if (!segment) {
            return;
        }
        const trimmed = segment.trim();
        if (!trimmed || seenText.has(trimmed)) {
            return;
        }
        seenText.add(trimmed);
        textSegments.push(segment);
    };

    if (typeof content === 'string' && !parsedContent) {
        registerTextSegment(content);
    }

    const textParts = partsArray.filter((part) => typeof part?.text === 'string' && part.text.trim().length > 0);
    textParts.forEach((part) => registerTextSegment(part.text));
    const structuredParts = partsArray.filter((part) => !textParts.includes(part));

    const displayText = textSegments.join('\n\n');
    const hasTextContent = displayText.trim().length > 0;

    let structuredContent = parsedContent;
    if (objectContent !== undefined && objectContent !== null) {
        structuredContent = objectContent;
    } else if (!structuredContent && structuredParts.length > 0) {
        structuredContent = structuredParts;
    }

    const showStructuredBlock = structuredContent !== undefined && structuredContent !== null && (typeof structuredContent !== 'string' || !hasTextContent);

    useEffect(() => {
        if (!hasTextContent || !contentRef.current) {
            setShowExpandButton(false);
            setIsExpanded(false);
            return;
        }
        const exceedsThreeLines = contentRef.current.scrollHeight > 72;
        setShowExpandButton(exceedsThreeLines);
        if (!exceedsThreeLines) {
            setIsExpanded(false);
        }
    }, [hasTextContent, displayText]);

    const partsCount = partsArray.length;
    const metaChips: { key: string; label: string }[] = [];
    if (partsCount > 0) {
        metaChips.push({
            key: 'parts-count',
            label: `${partsCount} ${partsCount === 1 ? 'part' : 'parts'}`
        });
    }
    if (showStructuredBlock) {
        metaChips.push({
            key: 'structured',
            label: Array.isArray(structuredContent) ? 'Structured parts' : tool_call_id ?`Tool Call ID: ${tool_call_id}` :  'JSON payload'
        });
    }
    if (toolCalls && toolCalls.length > 0) {
        metaChips.push({
            key: 'tool-calls',
            label: `${toolCalls.length} ${toolCalls.length === 1 ? 'tool call' : 'tool calls'}`
        });
    }

    const metaSummary = metaChips.map((chip) => chip.label).join(' • ');

    return (
        <div className={`flex flex-col gap-3 py-2`}>
            <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-zinc-300">{roleLabel}</span>
                
                {metaSummary && (
                    <span className="text-[11px] text-zinc-500">{metaSummary}</span>
                )}
            </div>
             
            {hasTextContent && (
                <div className="relative">
                    <div
                        ref={contentRef}
                        className={`whitespace-pre-wrap text-xs text-gray-200 ${!isExpanded && showExpandButton ? 'line-clamp-3 overflow-hidden' : ''}`}
                    >
                        <MarkdownViewer message={displayText} />
                    </div>
                    {showExpandButton && (
                        <button
                            onClick={() => setIsExpanded(!isExpanded)}
                            className="mt-2 inline-flex items-center gap-1 text-xs text-zinc-300 transition-colors hover:text-white"
                        >
                            {isExpanded ? (
                                <>
                                    <ChevronUp className="h-3 w-3" />
                                    Show less
                                </>
                            ) : (
                                <>
                                    <ChevronDown className="h-3 w-3" />
                                    Show more
                                </>
                            )}
                        </button>
                    )}
                </div>
            )}
           

            {showStructuredBlock && (
                <div className="rounded-lg bg-[#151515] px-3 py-2">
                    <div className="pb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
                        Structured Content
                    </div>
                    <ObjectMessageContent objectContent={structuredContent} />
                </div>
            )}

           

            {toolCalls && toolCalls.length > 0 && (
                <ToolCallList toolCalls={toolCalls} />
              
            )}
        </div>
    );
};


export const ObjectMessageContent = ({ objectContent }: { objectContent: any }) => {
    // check if objectContent is array
    let isArray = Array.isArray(objectContent);
    if (isArray) {
        return <div className="flex flex-col gap-1 divide-y divide-border">{objectContent.map((item: any, index: number) => {
            if (item.type === 'text' && item.text) {
                return <TextMessageContent key={`${index}_text`} text={item.text} cache_control={item.cache_control} />
            }
            return <JsonViewer key={`${index}_${item.type}`} data={item} />;
        })}</div>
    }
    return  typeof objectContent === 'string' ? <TextMessageContent text={objectContent} /> : <JsonViewer data={objectContent} />;
};

const TextMessageContent = ({ text, cache_control }: { text: string, cache_control?: any }) => {
    const [showExpandButton, setShowExpandButton] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!contentRef.current) {
            setShowExpandButton(false);
            setIsExpanded(false);
            return;
        }
        // Check if content height exceeds approximately 3 lines (using 72px as estimate)
        const exceedsThreeLines = contentRef.current.scrollHeight > 72;
        setShowExpandButton(exceedsThreeLines);
        if (!exceedsThreeLines) {
            setIsExpanded(false);
        }
    }, [text]);
    return <div ref={contentRef} className={`flex flex-col items-start gap-2 overflow-hidden py-2`}>
        <div className={`flex items-start ${!isExpanded && showExpandButton ? 'line-clamp-3 overflow-hidden max-h-[150px]' : ''} ${cache_control ? ' gap-2' : ''}`}>
            {cache_control && (
                <div className="flex items-center">
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div><DatabaseIcon className="w-4 h-4 text-zinc-300" /></div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="bg-zinc-900 text-zinc-100 border-zinc-800">
                                <p>This message uses cache control {cache_control.type ?  <span className=""> with type <span className="font-semibold text-white">{cache_control.type}</span></span> : ''}</p>
                            </TooltipContent>
                        </Tooltip>
                    </TooltipProvider>
                </div>
            )}
            <div className="flex flex-col gap-2 flex-1 whitespace-pre-wrap">
                <MarkdownViewer message={text} />
            </div>
        </div>
        {showExpandButton && (
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="mt-2 inline-flex items-center gap-1 text-xs text-zinc-300 transition-colors hover:text-white"
            >
                {isExpanded ? (
                    <>
                        <ChevronUp className="w-3 h-3" />
                        Show less
                    </>
                ) : (
                    <>
                        <ChevronDown className="w-3 h-3" />
                        Show more
                    </>
                )}
            </button>
        )}
    </div>
};
