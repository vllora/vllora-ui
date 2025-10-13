import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  WrenchScrewdriverIcon,
  CodeBracketIcon,
  FingerPrintIcon,
} from "@heroicons/react/24/outline";

import { ToolInfoCall } from "./spans-display/tool-display";
import { tryParseJson } from "@/utils/modelUtils";

interface ParameterProps {
  name: string;
  schema?: any;
  required?: boolean;
  valueInput?: any;
}

export const ParameterItem = ({
  name,
  schema,
  required,
  valueInput,
}: ParameterProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const hasNestedProperties =
    schema?.properties && Object.keys(schema.properties).length > 0;
  const hasEnum = Array.isArray(schema?.enum) && schema.enum.length > 0;
  const description = schema?.description || "";
  const typeLabel =
    schema?.type || (valueInput !== undefined ? typeof valueInput : "object");
  const isExpandable = Boolean(description || hasNestedProperties || hasEnum);

  const stringifiedValue =
    valueInput === undefined
      ? undefined
      : typeof valueInput === "string"
      ? valueInput
      : JSON.stringify(valueInput, null, 2);

  return (
    <div className="rounded-lg bg-[#151515] px-3 py-2">
      <button
        type="button"
        onClick={() => isExpandable && setIsOpen((prev) => !prev)}
        className={`flex w-full items-center justify-between gap-2 text-left text-xs text-zinc-100 ${
          isExpandable ? "hover:text-white" : "cursor-default"
        }`}
      >
        <div className="flex items-center gap-2">
          <CodeBracketIcon className="h-3 w-3 text-zinc-500" />
          <span className="font-medium">{name}</span>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-zinc-500">
          {required && (
            <span className="rounded bg-[#1f1f1f] px-1 py-0.5 text-zinc-300">
              req
            </span>
          )}
          <span className="rounded bg-[#1f1f1f] px-1.5 py-0.5 text-zinc-400">
            {typeLabel}
          </span>
          {isExpandable && (
            <ChevronDown
              className={`h-3 w-3 transition-transform ${
                isOpen ? "rotate-180" : ""
              }`}
            />
          )}
        </div>
      </button>

      {stringifiedValue !== undefined && (
        <div className="mt-2 overflow-hidden rounded-md bg-[#1d1d1d] px-2 py-1 font-mono text-[11px] text-zinc-300 whitespace-pre-wrap break-words">
          {stringifiedValue}
        </div>
      )}

      {isExpandable && isOpen && (
        <div className="mt-2 space-y-2 text-[11px] leading-relaxed text-zinc-400">
          {description && <p>{description}</p>}

          {hasEnum && (
            <div className="flex flex-wrap gap-1">
              {schema.enum.map((value: string, index: number) => (
                <span
                  key={index}
                  className="rounded bg-[#1f1f1f] px-1.5 py-0.5 text-[10px] text-zinc-300"
                >
                  {typeof value === "string" ? `"${value}"` : String(value)}
                </span>
              ))}
            </div>
          )}

          {hasNestedProperties && (
            <div className="space-y-1">
              <div className="text-[10px] uppercase tracking-wide text-zinc-500">
                Properties
              </div>
              <div className="space-y-1">
                {Object.entries(schema.properties).map(
                  ([propName, propSchema]: [string, any]) => (
                    <ParameterItem
                      key={propName}
                      name={propName}
                      schema={propSchema}
                      required={schema.required?.includes(propName)}
                    />
                  )
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const getArguments = (rawArguments: any) => {
  if (!rawArguments) return undefined;
  if (typeof rawArguments === "string") {
    return tryParseJson(rawArguments) ?? undefined;
  }
  return rawArguments;
};

export const ToolDefinitionsViewer = ({
  toolCalls,
}: {
  toolCalls: ToolInfoCall[];
}) => {
  const [expandedTools, setExpandedTools] =
    useState<Record<number, boolean>>({});

  const toggleTool = (index: number) => {
    setExpandedTools((prev) => ({
      ...prev,
      [index]: !(prev[index] ?? true),
    }));
  };

  if (!toolCalls || toolCalls.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4">
      {toolCalls.map((toolCall, index) => {
        const { id } = toolCall;
        const func = toolCall.function;
        const name = func?.name ?? "Tool call";
        const description = func?.description;
        const parameters = func?.parameters || {};
        const parametersProps = parameters?.properties || {};
        const requiredParams: string[] = parameters?.required || [];
        const paramCount = Object.keys(parametersProps).length;
        const argumentsJson = getArguments(func?.arguments);
        const argumentsCount = argumentsJson
          ? Object.keys(argumentsJson).length
          : 0;
        const isExpanded = expandedTools[index] ?? true;

        const meta: string[] = [];
        if (paramCount > 0) {
          meta.push(`${paramCount} ${paramCount === 1 ? "param" : "params"}`);
        }
        if (argumentsCount > 0) {
          meta.push(`${argumentsCount} ${argumentsCount === 1 ? "arg" : "args"}`);
        }

        return (
          <div
            key={`${name}-${index}`}
            className={`${index > 0 ? "border-t border-border/50 pt-4" : ""}`}
          >
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 text-left"
              onClick={() => toggleTool(index)}
            >
              <div className="flex items-center gap-2">
                <WrenchScrewdriverIcon className="h-3.5 w-3.5 text-zinc-400" />
                <span className="text-sm font-semibold text-zinc-100">
                  {name}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                {meta.length > 0 && <span>{meta.join(" • ")}</span>}
                <ChevronDown
                  className={`h-3 w-3 transition-transform ${
                    isExpanded ? "rotate-180" : ""
                  }`}
                />
              </div>
            </button>

            {isExpanded && (
              <div className="mt-3 space-y-3 text-xs text-zinc-300">
                {id && (
                  <div className="flex items-center gap-2 text-[11px] text-zinc-500">
                    <FingerPrintIcon className="h-3 w-3 text-zinc-500" />
                    <span className="font-mono">{id}</span>
                  </div>
                )}

                {description && (
                  <p className="leading-relaxed text-zinc-400">{description}</p>
                )}

                {paramCount > 0 && (
                  <div className="space-y-2">
                    <span className="text-[11px] uppercase tracking-wide text-zinc-500">
                      Parameters
                    </span>
                    <div className="space-y-1">
                      {Object.entries(parametersProps).map(
                        ([paramName, paramSchema]: [string, any]) => (
                          <ParameterItem
                            key={paramName}
                            name={paramName}
                            schema={paramSchema}
                            required={requiredParams.includes(paramName)}
                          />
                        )
                      )}
                    </div>
                  </div>
                )}

                {argumentsCount > 0 && argumentsJson && (
                  <div className="space-y-2">
                    <span className="text-[11px] uppercase tracking-wide text-zinc-500">
                      Arguments
                    </span>
                    <div className="space-y-1">
                      {Object.entries(argumentsJson).map(
                        ([argName, argValue]: [string, any]) => (
                          <ParameterItem
                            key={argName}
                            name={argName}
                            valueInput={argValue}
                          />
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
