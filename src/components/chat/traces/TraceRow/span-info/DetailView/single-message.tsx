import { useEffect, useRef, useState } from "react";
import { MarkdownViewer } from "./markdown-viewer";
import { JsonViewer } from "../JsonViewer";
import { DatabaseIcon, WrenchIcon, ChevronDown, ChevronUp } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ToolDefinitionsViewer } from "./tool-definitions-viewer";
import { tryParseJson } from "@/utils/modelUtils";

export const SingleMessage = (props: { role: string, content?: string, objectContent?: any, toolCalls?: any[], isFirst?: boolean, isLast?: boolean, parts?: any }) => {
    const { role, content, objectContent, toolCalls, parts } = props;

    const [isExpanded, setIsExpanded] = useState(false);
    const contentRef = useRef<HTMLDivElement>(null);
    const [showExpandButton, setShowExpandButton] = useState(false);
    useEffect(() => {
        if (contentRef.current) {
            // Check if content height exceeds approximately 3 lines (using 72px as estimate)
            const exceedsThreeLines = contentRef.current.scrollHeight > 72;
            setShowExpandButton(exceedsThreeLines);
        }
    }, [content]);

    const getRoleStyles = () => {
        return 'bg-[#0a0a0a] border-border hover:bg-[#0f0f0f] transition-colors';
    };

    const getRoleInfo = () => {
        switch (role.toLowerCase()) {
            case 'tool':
                return {
                    bgColor: 'bg-blue-500/20',
                    textColor: 'text-blue-400',
                    borderColor: 'border-blue-500/30',
                    label: 'Tool'
                };
            case 'assistant':
                return {
                    bgColor: 'bg-green-500/20',
                    textColor: 'text-green-400',
                    borderColor: 'border-green-500/30',
                    label: 'Assistant'
                };
            case 'system':
                return {
                    bgColor: 'bg-purple-500/20',
                    textColor: 'text-purple-400',
                    borderColor: 'border-purple-500/30',
                    label: 'System'
                };
            case 'ai':
                return {
                    bgColor: 'bg-amber-500/20',
                    textColor: 'text-amber-400',
                    borderColor: 'border-amber-500/30',
                    label: 'AI'
                };
            case 'user':
                return {
                    bgColor: 'bg-pink-500/20',
                    textColor: 'text-pink-400',
                    borderColor: 'border-pink-500/30',
                    label: 'User'
                };
            case 'model':
                return {
                    bgColor: 'bg-cyan-500/20',
                    textColor: 'text-cyan-400',
                    borderColor: 'border-cyan-500/30',
                    label: 'Model'
                };
            default:
                return {
                    bgColor: 'bg-gray-500/20',
                    textColor: 'text-gray-400',
                    borderColor: 'border-gray-500/30',
                    label: role
                };
        }
    };

    const roleInfo = getRoleInfo();
    let partText: string | undefined = undefined;
    

    let messageJson = content ? tryParseJson(content) : (parts || null);
    if (parts && Array.isArray(parts) && parts.length > 0 && parts[0].text && parts[0].text.length > 0) {
        partText = parts[0].text;
        messageJson = null;
    }
    
    return (
        <div className={`p-3 rounded-lg border ${getRoleStyles()}`}>
            <div className="flex flex-row items-start gap-3">
                {/* Role Badge */}
                <div className={`flex items-center justify-center px-2.5 py-1 rounded-full flex-shrink-0 w-20 ${roleInfo.bgColor} ${roleInfo.borderColor} border`}>
                    <span className={`text-xs font-medium ${roleInfo.textColor}`}>
                        {roleInfo.label}
                    </span>
                </div>
                {/* Message Content */}
                <div className="flex-1 min-w-0">
                   
                    {!messageJson && ((content && content.length > 0) || (partText && partText.length > 0)) ? (
                        <div className="relative">
                            <div
                                ref={contentRef}
                                className={`text-xs text-gray-200 whitespace-pre-wrap ${!isExpanded && showExpandButton ? 'line-clamp-3 overflow-hidden' : ''
                                    }`}
                            >
                                <MarkdownViewer message={content || partText || ''} />
                            </div>
                            {showExpandButton && (
                                <button
                                    onClick={() => setIsExpanded(!isExpanded)}
                                    className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 mt-2 transition-colors"
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
                    ) : toolCalls && toolCalls.length > 0 ? (
                        <></>
                    ) : (
                        (typeof objectContent === 'object' || messageJson) ? <ObjectMessageContent objectContent={objectContent || messageJson} /> : <div className="text-xs text-gray-400 italic">empty message</div>
                    )}
                    {toolCalls && toolCalls.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-border">
                            <div className="flex items-center gap-1.5 mb-2">
                                <WrenchIcon className="h-3.5 w-3.5 text-amber-400" />
                                <span className="text-xs font-medium text-white">Tool Calls</span>
                                <span className="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded font-medium">
                                    {toolCalls.length}
                                </span>
                            </div>
                            <div className="space-y-2">
                                <ToolDefinitionsViewer toolCalls={toolCalls} />
                                
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};


export const ObjectMessageContent = ({ objectContent }: { objectContent: any }) => {
    // check if objectContent is array
    let isArray = Array.isArray(objectContent);
    if (isArray) {
        return <div className="flex flex-col gap-1 divide-y divide-border">{objectContent.map((item: any, index: number) => {
            if (item.type === 'text' && item.text) {
                return <TextMessageContent text={item.text} cache_control={item.cache_control} />
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
        if (contentRef.current) {
            // Check if content height exceeds approximately 3 lines (using 72px as estimate)
            const exceedsThreeLines = contentRef.current.scrollHeight > 72;
            setShowExpandButton(exceedsThreeLines);
        }
    }, [text]);
    return <div ref={contentRef} className={`py-2 flex flex-col justify-start overflow-scroll items-start gap-2`}>
        <div className={`flex items-start truncate ${!isExpanded && showExpandButton && 'line-clamp-3 overflow-hidden truncate max-h-[150px]'} ${cache_control ? ' gap-2' : ''}`}>
            {cache_control && (
                <div className="flex items-center">
                    <TooltipProvider>
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <div><DatabaseIcon className="w-4 h-4 text-amber-500" /></div>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="bg-zinc-900 text-zinc-100 border-zinc-800">
                                <p>This message uses cache control {cache_control.type ?  <span className=""> with type <span className="font-semibold text-amber-500">{cache_control.type}</span></span> : ''}</p>
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
                className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 mt-2 transition-colors"
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
