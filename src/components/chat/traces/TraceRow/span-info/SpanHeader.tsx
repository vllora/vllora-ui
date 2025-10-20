import React from "react";
import { cn } from "@/lib/utils";
import { CheckCircleIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { ArrowLeft, DatabaseIcon, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipProvider, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Span } from "@/types/common-type";
import { BasicSpanInfo } from "./DetailView/basic-span-info-section";
import { ClientSdkIcon } from "@/components/client-sdk-icon";

const getDuration = (startTime?: number, endTime?: number): string | null => {
  if (!startTime || !endTime) return null;
  // Convert microseconds to seconds
  const seconds = (endTime - startTime) / 1000 / 1000;
  const secondsWith2Decimals = seconds.toFixed(2);
  if (secondsWith2Decimals === '0.00') {
    return '<0.01';
  }
  return secondsWith2Decimals;
};

const formatTimestamp = (timestamp: number): string => {
  // Convert microseconds to milliseconds
  const date = new Date(timestamp / 1000);
  return date.toLocaleString('en-US', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
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
  startTime,
  endTime,
  span,
}) => {
  const isSuccessStatus = status && ['200', 200].includes(status);
  const duration = getDuration(startTime, endTime);

  return (
    <div className="flex flex-row items-center gap-1 justify-between w-full">
      <div className="flex items-center gap-1">
        {onClose && <Button
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
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-medium text-white hover:cursor-help">{spanTitle}</h3>
          {duration && startTime && endTime && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#1a1a1a] text-teal-500 cursor-help">
                    <Timer className="h-3 w-3" />
                    <span className="text-xs font-mono">{duration}s</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="flex flex-col gap-2 p-3 max-w-xs bg-background border border-border rounded-md shadow-md">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Timer className="h-4 w-4 text-purple-500" />
                    <span>Duration Information</span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">Start time:</span>
                      <span className="text-xs font-mono">{formatTimestamp(startTime)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">End time:</span>
                      <span className="text-xs font-mono">{formatTimestamp(endTime)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-border">
                      <span className="text-xs font-medium">Duration:</span>
                      <span className="text-xs font-mono">{duration}s ({((endTime - startTime) / 1000).toFixed(0)} ms)</span>
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1">
        {status && (
          <div className={`flex items-center py-1 rounded-md text-xs ${isSuccessStatus ? ' text-green-500' : 'text-red-500'}`}>
            {isSuccessStatus ? (
              <CheckCircleIcon className="w-3 h-3 mr-1" />
            ) : (
              <ExclamationTriangleIcon className="w-3 h-3 mr-1" />
            )}
            {isSuccessStatus ? 'Success' : 'Failed'}
          </div>
        )}
        {span && <BasicSpanInfo span={span} />}
      </div>
    </div>
  );
};
