import React from "react";
import { cn } from "@/lib/utils";
import { ArrowLeft, ClockFadingIcon, DatabaseIcon, X } from "lucide-react";
import { StatusBadge } from "./StatusBadge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Span } from "@/types/common-type";
import { ClientSdkIcon } from "@/components/client-sdk-icon";
import { tryParseInt } from "@/utils/modelUtils";
import { getCost, getLabelOfSpan, getModelName, getTotalUsage } from "../new-timeline/utils";
import { LabelTag } from "../new-timeline/timeline-row/label-tag";
import { ModelContextViewer } from "./DetailView/spans-display/model-context-viewer";

export const getDuration = (startTime?: number, endTime?: number): string | null => {
  if (!startTime || !endTime) return null;
  // Convert microseconds to seconds
  const seconds = (endTime - startTime) / 1000 / 1000;
  const secondsWith2Decimals = seconds.toFixed(2);
  if (secondsWith2Decimals === '0.00') {
    return '<0.01';
  }
  return secondsWith2Decimals;
};

interface SpanHeaderProps {
  logoLink?: string;
  spanTitle: string;
  operationIcon: React.ReactNode;
  operationIconColor: string;
  sdkName?: string | null;
  operationName?: string;
  isPromptCached?: boolean;
  status?: string | number | null;
  onClose?: () => void;
  startTime?: number;
  endTime?: number;
  span?: Span;
  closePosition?: 'left' | 'right';
  ttf_str?: string;
}

export const SpanHeader: React.FC<SpanHeaderProps> = ({
  logoLink,
  spanTitle,
  operationIcon,
  operationIconColor,
  sdkName,
  operationName,
  isPromptCached,
  status,
  onClose,
  span,
  closePosition = 'left',
  ttf_str,
}) => {
  const ttftMicroseconds = ttf_str ? tryParseInt(ttf_str) : undefined;
  const ttftMilliseconds = ttftMicroseconds ? ttftMicroseconds / 1000 : undefined;
  const ttftSeconds = ttftMilliseconds ? (ttftMilliseconds / 1000).toFixed(2) : undefined;
  const labelOfSpan = span && getLabelOfSpan({ span });
  const modelName = span && getModelName({ span });
  const totalUsage = span && getTotalUsage({ span }) || 0;
  const costUsage = span && getCost({ span }) || 0;
  return (
    <div className="flex flex-row items-center gap-1 justify-between w-full">
      <div className="flex items-center gap-1 min-w-0 flex-1">
        {onClose && closePosition === 'left' && <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            onClose?.();
          }}
          className="h-8 w-8"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>}
        {logoLink ? (
          <img src={logoLink} alt={spanTitle} width={20} height={20} />
        ) : (
          <>
            <div className="relative">
              <div className={cn("p-1 rounded-full ", operationIconColor)}>
                {operationIcon}
              </div>
              {sdkName && (
                <div className="absolute -bottom-1 -right-1  bg-gray-800 rounded-full p-0.5 border border-gray-700 shadow-sm">
                  <ClientSdkIcon client_name={sdkName} className="w-2.5 h-2.5" />
                </div>
              )}
              {/* Cache indicator as subscript icon */}
              {operationName === 'cache' && (
                <div className="absolute -bottom-1 -right-1 bg-gray-800 rounded-full p-0.5 border border-gray-700 shadow-sm">
                  <DatabaseIcon className="w-2.5 h-2.5 text-blue-400" />
                </div>
              )}
              {/* Prompt caching indicator as subscript icon */}
              {isPromptCached && (
                <div className="absolute -bottom-1 -right-1 bg-gray-800 rounded-full p-0.5 border border-gray-700 shadow-sm">
                  <DatabaseIcon className="w-2.5 h-2.5 text-amber-400" />
                </div>
              )}
            </div>
          </>
        )}
        <div className="flex items-center gap-1 min-w-0">
          <TooltipProvider>
            <Tooltip delayDuration={300}>
              <TooltipTrigger asChild>
                <h3 className="text-xs font-medium text-white hover:cursor-help min-w-[65px] max-w-[150px] overflow-hidden text-ellipsis whitespace-nowrap">
                  {spanTitle}
                </h3>
                
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                align="start"
                sideOffset={5}
                className="max-w-md bg-background border border-border rounded-md shadow-md z-50"
              >
                <p className="text-sm break-words">{spanTitle}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {ttftSeconds && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#1a1a1a] text-white cursor-help flex-shrink-0">
                    <ClockFadingIcon className="h-3 w-3" />
                    <span className="text-xs font-mono">{ttftSeconds}s</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="flex flex-col gap-2 p-3 max-w-xs bg-background border border-border rounded-md shadow-md">
                 
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">TTFT:</span>
                      <span className="text-xs font-mono">{ttftSeconds}s</span>
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {modelName && totalUsage > 0 && <ModelContextViewer cost={costUsage} usage_tokens={totalUsage} model_name={modelName} />}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 px-2">
        {labelOfSpan && (
          <LabelTag label={labelOfSpan} maxWidth={150} />
        )}
        {status && <StatusBadge status={status} />}
        {/* {span && <BasicSpanInfo span={span} />} */}

        {onClose && closePosition === 'right' && <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.stopPropagation();
            onClose?.();
          }}
          className="h-8 w-8"
        >
          <X className="h-4 w-4" />
        </Button>}
      </div>

    </div>
  );
};
