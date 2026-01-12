import { useEffect, useRef, useState } from "react";
import { DatabaseIcon } from "lucide-react";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { MarkdownViewer } from "./markdown-viewer";
import { ExpandCollapseButton } from "./expand-collapse-button";

interface TextMessageContentProps {
    text: string;
    cache_control?: any;
}

export const TextMessageContent = ({ text, cache_control }: TextMessageContentProps) => {
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
            contentRef.current.scrollTop = 0;
        }
        setIsExpanded(!isExpanded);
    };

    return (
        <div
            ref={contentRef}
            className="flex flex-col items-start gap-2 py-2 rounded-lg transition-all duration-200 bg-zinc-800/30 border border-zinc-700/50 px-2"
        >
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
                                        <p>This message uses cache control {cache_control.type ? <span> with type <span className="font-semibold text-white">{cache_control.type}</span></span> : ''}</p>
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
                <div className={`flex items-start ${cache_control ? 'gap-2' : ''} ${isExpanded && showExpandButton
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
                                        <p>This message uses cache control {cache_control.type ? <span> with type <span className="font-semibold text-white">{cache_control.type}</span></span> : ''}</p>
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
    );
};
