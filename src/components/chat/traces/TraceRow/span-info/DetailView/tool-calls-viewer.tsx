import { FingerPrintIcon } from "@heroicons/react/24/outline";
import { JsonViewer } from "../JsonViewer";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { tryParseJson } from "@/utils/modelUtils";
import { ParameterItem } from "./tool-definitions-viewer";
export const ToolCallsViewer = (props: {
    input: {
        id: string;
        type: string;
        'function': FunctionCall;
        [key: string]: any
    }[] | undefined
}) => {
    const { input } = props;
    return (
        <div className="flex flex-col gap-4">
            {input?.map((toolCall: any, index: number) => (
                <div
                    key={index}
                    className={`${index > 0 ? 'border-t border-border/50 pt-4' : ''}`}
                >
                    <SingleToolCallViewer {...toolCall} />
                </div>
            ))}
        </div>
    );
}

export const SingleToolCallViewer = (props: {
    id: string;
    type: string;
    'function': FunctionCall;
    [key: string]: any
}) => {
    const { id, type, 'function': func } = props;
    const functionName = func?.name || 'Unknown Function';
    let argumentsJson = func?.arguments ? tryParseJson(func.arguments as string) : undefined;
    const argumentsCount = argumentsJson ? Object.keys(argumentsJson).length : 0;

    return (
        <div key={`tool_${id}`} className="space-y-3">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-zinc-100">{functionName}</span>
                    {id && (
                        <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <span className="font-mono cursor-help hover:text-zinc-400 transition-colors">
                                            {id}
                                        </span>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-[300px] p-2">
                                        <div className="space-y-1">
                                            <p className="text-xs font-medium">Tool Call ID</p>
                                            <p className="text-xs font-mono text-gray-300 break-all">{id}</p>
                                        </div>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                    {argumentsCount > 0 && (
                        <span>{argumentsCount} {argumentsCount === 1 ? 'arg' : 'args'}</span>
                    )}
                    {type && type !== 'function' && (
                        <span className="rounded bg-[#1f1f1f] px-1.5 py-0.5 text-zinc-400">
                            {type}
                        </span>
                    )}
                </div>
            </div>



            {argumentsJson ? (
                <div className="space-y-2">
                    <span className="text-[11px] uppercase tracking-wide text-zinc-500">
                        Arguments
                    </span>
                    <div className="space-y-1">
                        {Object.entries(argumentsJson).map(([argName, argValue]: [string, any]) => (
                            <ParameterItem
                                key={argName}
                                name={argName}
                                valueInput={argValue}
                            />
                        ))}
                    </div>
                </div>
            ) : (
                typeof func === 'object' && (
                    <JsonViewer data={func} style={{ fontSize: '10px' }} />
                )
            )}
        </div>
    );
}

interface FunctionCall {
    name: string;
    arguments: any;
}
