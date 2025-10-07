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
    return <div className="flex flex-col gap-2">
        {input?.map((toolCall: any, index: number) => (
            <SingleToolCallViewer key={index} {...toolCall} />
        ))}
    </div>
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
    
    return <div
        key={`tool_${id}`}
        className="border border-border rounded-md overflow-hidden bg-[#0d0d0d]"
    >
        <div className="flex items-center justify-between w-full p-2 hover:bg-[#151515] transition-colors">
            <div className="flex items-center gap-3">
                <div className="flex flex-col gap-0.5">
                    <span className="font-medium text-xs text-white">{functionName}</span>
                    {id && (
                        <div className="flex items-center gap-1">
                            <FingerPrintIcon className="h-3 w-3 text-gray-500" />
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <span className="text-[10px] text-gray-500 font-mono cursor-help hover:text-gray-400 transition-colors">
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
            </div>
            {type && type !== 'function' && (
                <span className="text-[10px] bg-[#1a1a1a] text-gray-400 px-1.5 py-0.5 rounded">
                    {type}
                </span>
            )}
        </div>
        <div className="border-t border-border">
            <div key={id} className="flex flex-col gap-1 bg-[#111111] p-2 mt-2 rounded-md">
                {typeof func !== 'object' && <span className="text-xs text-gray-400 font-mono break-all">
                    {typeof func === 'object' ? JSON.stringify(func) : String(func)}
                </span>}
                {argumentsJson ? <div className="space-y-1">
                                                {Object.entries(argumentsJson).map(([argName, argValue]: [string, any]) => (
                                                    <ParameterItem 
                                                        key={argName} 
                                                        name={argName} 
                                                        valueInput={argValue}
                                                    />
                                                ))}
                                            </div>: (typeof func === 'object' && <JsonViewer data={func} style={{
                    fontSize: '10px',
                }} />)}
            </div>
        </div>

    </div>
   
}

interface FunctionCall {
    name: string;
    arguments: any;
}
