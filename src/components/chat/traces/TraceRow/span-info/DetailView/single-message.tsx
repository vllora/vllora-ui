import { useEffect, useRef, useState } from "react";
import { MarkdownViewer } from "./markdown-viewer";
import { JsonViewer } from "../JsonViewer";
import { DatabaseIcon, ChevronDown, ChevronUp, User, Bot, Settings, Wrench, Brain, Cpu, Copy, Check, Eye, EyeOff } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { tryParseJson } from "@/utils/modelUtils";
import { ToolCallList } from "@/components/chat/messages/ToolCallList";

const ExpandCollapseButton = ({ isExpanded, onClick }: { isExpanded: boolean; onClick: () => void }) => (
    <button
        onClick={onClick}
        className="mt-2 inline-flex items-center gap-1 text-[10px] text-zinc-400 transition-colors hover:text-white"
    >
        {isExpanded ? (
            <>
                <ChevronUp className="h-3 w-3" />
                <span className="text-[10px]"> Show less</span>
            </>
        ) : (
            <>
                <ChevronDown className="h-3 w-3" />
                <span className="text-[10px]"> Read more</span>
            </>
        )}
    </button>
);

export const SingleMessage = (props: { role: string, content?: string, objectContent?: any, toolCalls?: any[], isFirst?: boolean, isLast?: boolean, parts?: any, tool_call_id?: string }) => {
    const { role, content, objectContent, toolCalls, parts } = props;

    const [isExpanded, setIsExpanded] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);
    const [showExpandButton, setShowExpandButton] = useState(false);
    const [copied, setCopied] = useState(false);
    const [rawMode, setRawMode] = useState(false);

    const handleToggleExpand = () => {
        if (isExpanded && contentRef.current) {
            // Reset scroll to top when collapsing
            contentRef.current.scrollTop = 0;
        }
        setIsExpanded(!isExpanded);
    };

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

    const getRoleStyle = () => {
        const normalizedRole = role?.toLowerCase?.() || '';
        switch (normalizedRole) {
            case 'user':
                return {
                    icon: User,
                    bgColor: 'bg-blue-500/10',
                    textColor: 'text-blue-400',
                    borderColor: 'border-blue-500/20'
                };
            case 'assistant':
            case 'ai':
                return {
                    icon: Bot,
                    bgColor: 'bg-purple-500/10',
                    textColor: 'text-purple-400',
                    borderColor: 'border-purple-500/20'
                };
            case 'system':
                return {
                    icon: Settings,
                    bgColor: 'bg-amber-500/10',
                    textColor: 'text-amber-400',
                    borderColor: 'border-amber-500/20'
                };
            case 'tool':
                return {
                    icon: Wrench,
                    bgColor: 'bg-green-500/10',
                    textColor: 'text-green-400',
                    borderColor: 'border-green-500/20'
                };
            case 'model':
                return {
                    icon: Brain,
                    bgColor: 'bg-pink-500/10',
                    textColor: 'text-pink-400',
                    borderColor: 'border-pink-500/20'
                };
            default:
                return {
                    icon: Cpu,
                    bgColor: 'bg-zinc-500/10',
                    textColor: 'text-zinc-400',
                    borderColor: 'border-zinc-500/20'
                };
        }
    };

    const roleLabel = getRoleLabel();
    const roleStyle = getRoleStyle();
    const RoleIcon = roleStyle.icon;

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
    // if (showStructuredBlock) {
    //     metaChips.push({
    //         key: 'structured',
    //         label: Array.isArray(structuredContent) ? 'Structured parts' : tool_call_id ?`Tool Call ID: ${tool_call_id}` :  'JSON payload'
    //     });
    // }
    if (toolCalls && toolCalls.length > 0) {
        metaChips.push({
            key: 'tool-calls',
            label: `${toolCalls.length} ${toolCalls.length === 1 ? 'tool call' : 'tool calls'}`
        });
    }

    const metaSummary = metaChips.map((chip) => chip.label).join(' • ');

    const handleCopy = async () => {
        let textToCopy = displayText;
        if (!textToCopy && structuredContent) {
            textToCopy = JSON.stringify(structuredContent, null, 2);
        }
        if (textToCopy) {
            await navigator.clipboard.writeText(textToCopy);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    return (
        <div className={`flex flex-col gap-3 py-3 px-2  transition-colors`}>
            <div className="flex items-center justify-between gap-2">
                <div className={`inline-flex justify-center items-center gap-1 rounded-md border px-2 py-1 ${roleStyle.bgColor} ${roleStyle.borderColor}`}>
                    <RoleIcon className={`h-2.5 w-2.5 ${roleStyle.textColor}`} />
                    <span className={`text-[9px] font-semibold uppercase tracking-wide ${roleStyle.textColor}`}>
                        {roleLabel}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                {metaSummary && (
                    <span className="text-[11px] text-zinc-500">{metaSummary}</span>
                )}
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <button
                                onClick={() => setRawMode(!rawMode)}
                                className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400 hover:text-zinc-300  hover:bg-zinc-700 rounded transition-colors"
                            >
                                {rawMode ? (
                                    <EyeOff className="w-3 h-3" />
                                ) : (
                                    <Eye className="w-3 h-3" />
                                )}
                            </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="bg-zinc-900 text-zinc-100 border-zinc-800">
                            <p>{rawMode ? "Show formatted" : "Show raw"}</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
                <button
                    onClick={handleCopy}
                    className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400 hover:text-zinc-300  hover:bg-zinc-700 rounded transition-colors"
                >
                    {copied ? (
                        <Check className="w-3 h-3 text-green-500" />
                    ) : (
                        <Copy className="w-3 h-3" />
                    )}
                </button>
                </div>
            </div>
             
            {hasTextContent && (
                <div className={`flex flex-col gap-2 rounded-lg transition-all duration-200 overflow-hidden ${
                    'bg-zinc-800/30 border border-zinc-700/50 p-2'
                }`}>
                    {rawMode ? (
                        <div
                            className="whitespace-pre-wrap break-words text-xs text-zinc-400 min-w-0 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-zinc-900"
                        >
                            {displayText}
                        </div>
                    ) : !isExpanded && showExpandButton ? (
                        <div
                            ref={contentRef}
                            className="whitespace-pre-wrap break-words text-xs text-zinc-400 min-w-0 line-clamp-3 overflow-hidden"
                        >
                            {displayText}
                        </div>
                    ) : (
                        <div
                            ref={contentRef}
                            className={`whitespace-pre-wrap break-words text-xs text-zinc-400 min-w-0 ${
                                isExpanded && showExpandButton
                                    ? 'max-h-[400px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-zinc-900'
                                    : ''
                            }`}
                        >
                            <MarkdownViewer message={displayText} />
                        </div>
                    )}
                    {!rawMode && showExpandButton && (
                        <div className="ml-auto">
                            <ExpandCollapseButton
                                isExpanded={isExpanded}
                                onClick={handleToggleExpand}
                            />
                        </div>
                    )}
                </div>
            )}
           

            {showStructuredBlock && (
                <div className="rounded-lg py-2 overflow-hidden">
                    <div className="pb-1 text-[10px] text-wrap font-semibold uppercase tracking-wide text-zinc-500">
                        Structured Content
                    </div>
                    <div className="max-w-full overflow-x-auto">
                        {rawMode ? (
                            <JsonViewer data={structuredContent} />
                        ) : (
                            <ObjectMessageContent objectContent={structuredContent} />
                        )}
                    </div>
                </div>
            )}

           

            {toolCalls && toolCalls.length > 0 && (
                <div className="rounded-lg py-2 overflow-hidden">
                    {rawMode ? (
                        <>
                            <div className="pb-1 text-[10px] text-wrap font-semibold uppercase tracking-wide text-zinc-500">
                                Tool Calls (Raw)
                            </div>
                            <div className="max-w-full overflow-x-auto">
                                <JsonViewer data={toolCalls} />
                            </div>
                        </>
                    ) : (
                        <ToolCallList toolCalls={toolCalls} />
                    )}
                </div>
            )}
        </div>
    );
};


export const ObjectMessageContent = ({ objectContent }: { objectContent: any }) => {
    // check if objectContent is array
    let isArray = Array.isArray(objectContent);
    if (isArray) {
        return <div className="flex flex-col gap-2 divide-y divide-border text-zinc-400 max-w-full overflow-hidden">{objectContent.map((item: any, index: number) => {
            if (item.type === 'text' && item.text) {
                return <TextMessageContent key={`${index}_text`} text={item.text} cache_control={item.cache_control} />
            }
            return <div key={`${index}_${item.type}`} className="max-w-full overflow-x-auto"><JsonViewer data={item} /></div>;
        })}</div>
    }
    return  typeof objectContent === 'string' ? <TextMessageContent text={objectContent} /> : <div className="max-w-full overflow-x-auto"><JsonViewer data={objectContent} /></div>;
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
        const exceedsThreeLines = contentRef.current.scrollHeight > 72;
        setShowExpandButton(exceedsThreeLines);
        if (!exceedsThreeLines) {
            setIsExpanded(false);
        }
    }, [text]);

    const handleToggleExpand = () => {
        if (isExpanded && contentRef.current) {
            // Reset scroll to top when collapsing
            contentRef.current.scrollTop = 0;
        }
        setIsExpanded(!isExpanded);
    };

    return <div ref={contentRef} className={`flex flex-col items-start gap-2 py-2 rounded-lg transition-all duration-200 ${
        'bg-zinc-800/30 border border-zinc-700/50 px-2'
    }`}>
        {!isExpanded && showExpandButton ? (
            <div className="flex items-start w-full gap-2">
                {cache_control && (
                    <div className="flex items-center flex-shrink-0">
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
                <div className="flex-1 min-w-0 whitespace-pre-wrap break-words line-clamp-3 overflow-hidden">
                    {text}
                </div>
            </div>
        ) : (
            <div className={`flex items-start ${cache_control ? 'gap-2' : ''} ${
                isExpanded && showExpandButton
                    ? 'max-h-[400px] overflow-y-auto w-full pr-2 scrollbar-thin scrollbar-thumb-zinc-700 scrollbar-track-zinc-900'
                    : 'w-full'
            }`}>
                {cache_control && (
                    <div className="flex items-center flex-shrink-0">
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
                <div className="flex flex-col gap-2 flex-1 min-w-0 whitespace-pre-wrap break-words overflow-wrap-anywhere">
                    <MarkdownViewer message={text} />
                </div>
            </div>
        )}
        {showExpandButton && (
            <div className="ml-auto">
                <ExpandCollapseButton
                    isExpanded={isExpanded}
                    onClick={handleToggleExpand}
                />
            </div>
        )}
    </div>
};
