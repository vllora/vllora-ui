import { ToolInfoCall } from "./spans-display/tool-display";
import { WrenchScrewdriverIcon, CodeBracketIcon, FingerPrintIcon } from "@heroicons/react/24/outline";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { tryParseJson } from "@/utils/modelUtils";

interface ParameterProps {
    name: string;
    schema?: any;
    required?: boolean;
    valueInput?: any;
}

export const ParameterItem = ({ name, schema, required, valueInput }: ParameterProps) => {
    const [isOpen, setIsOpen] = useState(false);
    const hasNestedProperties = schema?.properties && Object.keys(schema.properties).length > 0;
    const type = schema?.type || (valueInput && typeof valueInput) || "object";
    const description = schema?.description || "";

    return (
        <div className="border border-border rounded mb-1 overflow-hidden">
            <div
                className="flex items-center justify-between px-2 py-1 cursor-pointer hover:bg-[#151515]"
                onClick={() => (description || hasNestedProperties || schema?.enum) && setIsOpen(!isOpen)}
            >
                <div className="flex items-center gap-1.5 flex-1">
                    <CodeBracketIcon className="h-3 w-3 text-blue-400" />
                    <span className="text-xs font-medium text-white">{name}</span>
                    {required && (
                        <span className="text-[10px] bg-blue-900/30 text-blue-400 px-1 py-0.5 rounded">
                            req
                        </span>
                    )}
                    <span className="text-[10px] bg-[#1a1a1a] text-gray-400 px-1 py-0.5 rounded">
                        {type}
                    </span>

                </div>

            </div>
            {valueInput && (
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <div className="text-[12px] w-full flex-1 flex gap-1 text-left text-white px-1 py-0.5 line-clamp-1 ellipsis rounded cursor-help">
                                <div><span className="text-[10px] bg-blue-900/30 text-blue-400 px-1 py-0.5 rounded">value:</span></div>
                                <div className="px-1 py-0.5 rounded line-clamp-2">{typeof valueInput === 'object' ? JSON.stringify(valueInput, null, 2) : typeof valueInput === 'string' ? String(valueInput) : JSON.stringify(valueInput)}</div>
                            </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[400px] p-3">
                            <div className="space-y-1">
                                <p className="text-xs font-medium">Parameter Value</p>
                                <div className="text-xs text-gray-300 font-mono break-all whitespace-pre-wrap max-h-[200px] overflow-y-auto">
                                    {typeof valueInput === 'object' ? JSON.stringify(valueInput, null, 2) : typeof valueInput === 'string' ? String(valueInput) : JSON.stringify(valueInput)}
                                </div>
                            </div>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            )}

            {isOpen && (description || hasNestedProperties || schema.enum) && (
                <div className="px-2 py-1 bg-[#0a0a0a] border-t border-border">
                    {description && (
                        <div className="mb-1">
                            <span className="text-xs text-gray-400">{description}</span>
                        </div>
                    )}

                    {hasNestedProperties && (
                        <div className="mt-1">
                            <div className="text-xs font-medium text-gray-400 mb-1">Properties:</div>
                            <div className="pl-2">
                                {Object.entries(schema.properties).map(([propName, propSchema]: [string, any]) => (
                                    <ParameterItem
                                        key={propName}
                                        name={propName}
                                        schema={propSchema}
                                        required={schema.required?.includes(propName)}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {schema.enum && (
                        <div className="mt-1">
                            <div className="text-xs font-medium text-gray-400 mb-1">Values:</div>
                            <div className="flex flex-wrap gap-1">
                                {schema.enum.map((value: string, i: number) => (
                                    <span
                                        key={i}
                                        className="text-[10px] bg-[#1a1a1a] text-gray-300 px-1 py-0.5 rounded"
                                    >
                                        {typeof value === 'string' ? `"${value}"` : String(value)}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export const ToolDefinitionsViewer = ({ toolCalls }: { toolCalls: ToolInfoCall[] }) => {
    const [expandedTools, setExpandedTools] = useState<Set<number>>(new Set());
    const toggleTool = (index: number) => {
        const newExpanded = new Set(expandedTools);
        if (newExpanded.has(index)) {
            newExpanded.delete(index);
        } else {
            newExpanded.add(index);
        }
        setExpandedTools(newExpanded);
    };

    return (
        <div className="flex flex-col gap-2">
            {toolCalls && toolCalls.length > 0 && toolCalls.map((toolCall, index) => {
                const { id } = toolCall;
                const { name, description, parameters } = toolCall.function;
                const argumentsJson = toolCall.function.arguments ? tryParseJson(toolCall.function.arguments as string) : undefined;
                const argumentsCount = argumentsJson ? Object.keys(argumentsJson).length : 0;
                const requiredParams = parameters?.required || [];
                const paramCount = parameters?.properties ? Object.keys(parameters.properties).length : 0;
                const isExpanded = expandedTools.has(index);

                return (
                    <div
                        key={`${name}-${index}`}
                        className="border border-border rounded overflow-hidden bg-[#0d0d0d]"
                    >
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div
                                        className="flex items-center justify-between w-full px-2 py-1.5 hover:bg-[#151515] transition-colors cursor-pointer"
                                        onClick={() => toggleTool(index)}
                                    >
                                        <div className="flex items-center gap-2">
                                            <WrenchScrewdriverIcon className="h-3 w-3 text-amber-400" />
                                            <div className="flex flex-col gap-0.5">
                                                <span className="font-medium text-xs text-white">{name}</span>

                                            </div>
                                            {paramCount > 0 && (
                                                <span className="text-[10px] bg-[#1a1a1a] text-gray-400 px-1 py-0.5 rounded">
                                                    {paramCount} params
                                                </span>
                                            )}
                                            {argumentsCount > 0 && (
                                                <span className="text-[10px] bg-[#1a1a1a] text-gray-400 px-1 py-0.5 rounded">
                                                    {argumentsCount} args
                                                </span>
                                            )}
                                        </div>
                                        <ChevronDown className={`h-3 w-3 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="max-w-[400px] p-3 bg-[#1a1a1a] border border-border">
                                    <div className="space-y-2">
                                        <div className="flex items-center gap-2">
                                            <WrenchScrewdriverIcon className="h-4 w-4 text-amber-400" />
                                            <span className="font-semibold text-sm text-white">{name}</span>
                                        </div>

                                        {id && (
                                            <div className="flex items-center gap-2 pt-1">
                                                <FingerPrintIcon className="h-3 w-3 text-gray-400" />
                                                <span className="text-xs text-gray-400 font-mono">{id}</span>
                                            </div>
                                        )}

                                        {description && (
                                            <div>
                                                <span className="text-xs text-gray-300">{description}</span>
                                            </div>
                                        )}

                                        {paramCount > 0 && (
                                            <div className="border-t border-border pt-2">
                                                <span className="text-xs font-medium text-gray-400 mb-1 block">
                                                    Parameters ({paramCount}):
                                                </span>
                                                <div className="space-y-1 max-h-32 overflow-y-auto">
                                                    {Object.entries(parameters.properties).slice(0, 10).map(([paramName, paramSchema]: [string, any]) => (
                                                        <div key={paramName} className="flex items-center gap-2">
                                                            <span className="text-xs text-white font-mono">{paramName}</span>
                                                            <span className="text-[10px] bg-[#0a0a0a] text-gray-400 px-1 py-0.5 rounded">
                                                                {paramSchema.type || 'object'}
                                                            </span>
                                                            {requiredParams.includes(paramName) && (
                                                                <span className="text-[10px] bg-blue-900/30 text-blue-400 px-1 py-0.5 rounded">
                                                                    req
                                                                </span>
                                                            )}
                                                        </div>
                                                    ))}
                                                    {Object.keys(parameters.properties).length > 10 && (
                                                        <div className="text-xs text-gray-500 pt-1">
                                                            +{Object.keys(parameters.properties).length - 10} more parameters...
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="text-xs text-gray-500 pt-1 border-t border-border mt-2">
                                                    Click to expand for full details
                                                </div>
                                            </div>
                                        )}
                                        {argumentsCount > 0 && (
                                            <div className="border-t border-border pt-2">
                                                <span className="text-xs font-medium text-gray-400 mb-1 block">
                                                    Arguments ({argumentsCount}):
                                                </span>
                                                <div className="space-y-1 max-h-32 overflow-y-auto">
                                                    {Object.entries(argumentsJson).slice(0, 10).map(([argName, argValue]: [string, any]) => (
                                                        <div key={argName} className="flex items-center gap-2">
                                                            <span className="text-xs text-white font-mono">{argName}</span>
                                                            <span className="text-[10px] bg-[#0a0a0a] text-gray-400 px-1 py-0.5 rounded">
                                                                {typeof argValue}
                                                            </span>
                                                        </div>
                                                    ))}
                                                    {Object.keys(argumentsJson).length > 10 && (
                                                        <div className="text-xs text-gray-500 pt-1">
                                                            +{Object.keys(argumentsJson).length - 10} more arguments...
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="text-xs text-gray-500 pt-1 border-t border-border mt-2">
                                                    Click to expand for full details
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>

                        {isExpanded && (
                            <div className="border-t border-border">
                                <div className="p-2 flex flex-col gap-2">
                                    {id && (
                                        <div className="flex items-center gap-2 pb-2 border-b border-border">
                                            <FingerPrintIcon className="h-3 w-3 text-gray-500" />
                                            <span className="text-xs text-gray-500">ID:</span>
                                            <span className="text-xs text-gray-400 font-mono">{id}</span>
                                        </div>
                                    )}
                                    {description && (
                                        <div className="flex flex-col gap-1">
                                            <span className="text-xs text-gray-400">{description}</span>
                                        </div>
                                    )}

                                    {parameters && parameters.properties && (
                                        <div className="flex flex-col gap-1">
                                            <span className="text-xs font-medium text-gray-400">Parameters:</span>
                                            <div className="space-y-1">
                                                {Object.entries(parameters.properties).map(([paramName, paramSchema]: [string, any]) => (
                                                    <ParameterItem
                                                        key={paramName}
                                                        name={paramName}
                                                        schema={paramSchema}
                                                        required={requiredParams.includes(paramName)}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {argumentsCount > 0 && argumentsJson && (
                                        <div className="flex flex-col gap-1">
                                            <span className="text-xs font-medium text-gray-400">Arguments:</span>
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
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
};