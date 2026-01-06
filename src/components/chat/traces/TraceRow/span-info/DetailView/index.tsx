import { ExtraParameters } from "./input-viewer";
import { OutputViewer } from "./output-viewer";
import { UsageViewer } from "./usage-viewer";
import { ExclamationTriangleIcon } from "@heroicons/react/24/solid";
import { ErrorViewer } from "./error-viewer";
import { useEffect, useState, Component, ErrorInfo, ReactNode } from "react";
import { MessageViewer } from "./message-viewer";
import { ChatWindowConsumer } from "@/contexts/ChatWindowContext";
import { Span, ToolCall } from "@/types/common-type";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import { BaseSpanUIDisplay } from "./BaseSpanUIDisplay";

// Error Boundary Component
interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('BaseSpanUIDetailsDisplay Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="flex flex-col items-center justify-center p-4 text-red-500 border border-red-500 rounded-md">
          <ExclamationTriangleIcon className="w-6 h-6 mb-2" />
          <p className="text-sm font-semibold">Failed to render span details</p>
          <p className="text-xs text-gray-400 mt-1">{this.state.error?.message}</p>
        </div>
      );
    }

    return this.props.children;
  }
}

const findParentApiInvoke = (spans: Span[], parent_span_id: string) => {
  let span = spans.find(span => span.span_id === parent_span_id);
  if (!span) return undefined;
  if (span.operation_name === 'api_invoke') {
    return span;
  }

  if (!span.parent_span_id || span.parent_span_id === '0') {
    return undefined;
  }

  return findParentApiInvoke(spans, span.parent_span_id);
}


const getParentWithOperationName = (spans: Span[], currentSpanId: string, operationName: string) => {
  let currentSpan = spans.find(s => s.span_id === currentSpanId);

  if(!currentSpan) return undefined;
  if(currentSpan.parent_span_id === '0' || !currentSpan.parent_span_id) {
    return undefined;
  }
  let parentSpan = spans.find(s => s.span_id === currentSpan?.parent_span_id);

  if(parentSpan && parentSpan.operation_name === operationName) {
    return parentSpan;
  }
  return getParentWithOperationName(spans, currentSpan.parent_span_id, operationName);
}


export const getParentApiInvoke = (spans: Span[], currentSpanId: string) => {
  return getParentWithOperationName(spans, currentSpanId, 'api_invoke');
}
export const getParentCloudApiInvoke = (spans: Span[], currentSpanId: string) => {
  return getParentWithOperationName(spans, currentSpanId, 'cloud_api_invoke');
}

const getParentCloudModelCall = (spans: Span[], currentSpanId: string) => {
  return getParentWithOperationName(spans, currentSpanId, 'model_call');
}

export const isActualModelCall = (span: Span) => {
 let operationName = span.operation_name;
 return operationName && !['api_invoke', 'cloud_api_invoke', 'model_call', 'tool_call', 'tools'].includes(operationName) && !operationName.startsWith('guard_');
}


export const isToolSpan = (span: Span) => {
  let operationName = span.operation_name;
  return operationName && operationName.startsWith('tools');
}

export const getStatus = (spans: Span[], currentSpanId: string) => {

  let currentSpan = spans.find(span => span.span_id === currentSpanId);
  let currentSpanAttribute = currentSpan?.attribute as any;
  if(currentSpanAttribute && currentSpanAttribute.status) {
    return currentSpanAttribute.status;
  }
  if(currentSpan && isActualModelCall(currentSpan)) {
     let parentCloudApiInvoke = getParentCloudApiInvoke(spans, currentSpanId);
     if(parentCloudApiInvoke) {
      let parentCloudApiInvokeAttribute = parentCloudApiInvoke.attribute as any;
      return parentCloudApiInvokeAttribute.status

     }
  }
  if(currentSpan && isToolSpan(currentSpan)) {
     const attributeTool = currentSpan.attribute as ToolCall;
       const isSuccess = !attributeTool.error;
       return isSuccess ? '200' : '500';
  }
  return undefined;
}

export const getApiCloudInvokeSpans = (spans: Span[], currentSpanId: string) => {
  let currentSpan = spans.find(span => span.span_id === currentSpanId);
  if(currentSpan && isActualModelCall(currentSpan)) {
    return getParentCloudApiInvoke(spans, currentSpanId);
  }
  return undefined;
}

export const getApiInvokeSpans = (spans: Span[], currentSpanId: string) => {
  let currentSpan = spans.find(span => span.span_id === currentSpanId);
  if(currentSpan && isActualModelCall(currentSpan)) {
    return getParentApiInvoke(spans, currentSpanId);
  }
  return undefined;
}
export const getModelCallSpans = (spans: Span[], currentSpanId: string) => {
  let currentSpan = spans.find(span => span.span_id === currentSpanId);
  if(currentSpan && isActualModelCall(currentSpan)) {
    return getParentCloudModelCall(spans, currentSpanId);
  }
  return undefined;
}



export const SpanUIDetailsDisplay = ({ span }: { span: Span }) => {
  const { runMap } = ChatWindowConsumer();
  const relatedSpans = runMap[span.run_id] || [];
  return <BaseSpanUIDisplay span={span} relatedSpans={relatedSpans} />;
}






export const BaseSpanUIDetailsDisplay = ({children, defaultOpen, value, onValueChange }: { children: React.ReactNode, defaultOpen?: string[], value?: string[], onValueChange?: (value: string[]) => void }) => {
  const content = value !== undefined && onValueChange ? (
    // Controlled mode
    <Accordion type="multiple" value={value} onValueChange={onValueChange}>
      {children}
    </Accordion>
  ) : (
    // Uncontrolled mode (existing behavior)
    <Accordion type="multiple" className="mt-4 flex-1 flex flex-col" defaultValue={defaultOpen ? defaultOpen : []}>
      {children}
    </Accordion>
  );

  return <ErrorBoundary>{content}</ErrorBoundary>;
}

export const SpanModelDetailsDisplay = ({ obj }: { obj: any }) => {
  let usage = obj.usage;
  const { runMap, selectedSpan } = ChatWindowConsumer();
  let status = selectedSpan ? getStatus(runMap[selectedSpan.run_id], selectedSpan.span_id) : undefined;
  let error = undefined //modelCallAttribute?.error || apiInvokeAttribute?.error;
  let output = undefined //modelCallAttribute?.response || modelCallAttribute?.output || apiInvokeAttribute?.response;
  let request = undefined //apiInvokeAttribute?.request
  let cost_str = undefined //apiInvokeAttribute?.cost
  let ttf_str = undefined //modelCallAttribute?.ttft
  let usage_str = undefined //modelCallAttribute?.usage
  const [costInfo, setCostInfo] = useState<any>();
  const [inputInfo, setInputInfo] = useState<any>();
  const [usageInfo, setUsageInfo] = useState<any>();
  useEffect(() => {
    if (request) {
      try {
        let parsedInput = JSON.parse(request);
        setInputInfo(parsedInput);
      } catch (e) {
      }
    }
  }, [request]);
  useEffect(() => {
    if (cost_str) {
      try {
        let parsedCost = JSON.parse(cost_str);
        setCostInfo(parsedCost);
      } catch (e) {
      }
    }
  }, [cost_str]);
  useEffect(() => {
    if (usage_str) {
      try {
        let parsedUsage = JSON.parse(usage_str);
        setUsageInfo(parsedUsage);
      } catch (e) {
      }
    }
  }, [usage_str]);

  const triggerClassName = "px-2 py-3";
  let keys = inputInfo && Object.keys(inputInfo);
  let hasExtraParameters = keys && keys.filter((key: string) => key !== 'messages').length > 0;
  return <BaseSpanUIDetailsDisplay defaultOpen={ error ? ['error'] : []}>
    {status && <span className="flex text-xs flex-row gap-2 items-center px-2 text-white border-b border-border pb-2"> Status: <span className={cn("text-xs font-semibold mr-2", status === '200' ? 'text-green-500' : 'text-red-500')}>{status}</span></span>}
    {inputInfo && inputInfo.messages && <AccordionItem value="input">
      <AccordionTrigger className={triggerClassName}>
        <div className="flex flex-row gap-2 justify-center items-center">
          <span className="font-semibold text-xs text-white">Messages</span>
          {inputInfo.messages && <span className="text-xs text-gray-400">{inputInfo.messages.length} messages</span>}
        </div>
      </AccordionTrigger>
      <AccordionContent className="overflow-y-auto">
        <MessageViewer messages={inputInfo.messages} showSection={false} />
      </AccordionContent>
    </AccordionItem>}
    {inputInfo && hasExtraParameters && <AccordionItem value="extra-parameters">
      <AccordionTrigger className={triggerClassName}>
        <div className="flex flex-row gap-2 justify-center items-center">
          <span className="font-semibold text-xs text-white">Additional Parameters </span>
          {keys && keys.filter((key: string) => key !== 'messages').length > 0 && <span className="text-xs text-gray-400">{keys.filter((key: string) => key !== 'messages').length} parameters</span>}
        </div>
      </AccordionTrigger>
      <AccordionContent>
        <ExtraParameters input={inputInfo} />
      </AccordionContent>
    </AccordionItem>}
    {output && <AccordionItem value="output">
      <AccordionTrigger className={triggerClassName}>
        <div className="flex flex-row gap-2 justify-between items-center w-full">
          <span className="font-semibold text-xs text-white">Output</span>
        </div>
      </AccordionTrigger>
      <AccordionContent>
        <OutputViewer response_str={output} />
      </AccordionContent>
    </AccordionItem>}
    {usage && <AccordionItem value="usage">
      <AccordionTrigger className={triggerClassName}>
        <div className="flex flex-row gap-2 justify-center items-center">
          <span className="font-semibold text-xs text-white">Usage</span>
        </div>
      </AccordionTrigger>
      <AccordionContent>
        <UsageViewer
          cost={costInfo || undefined}
          ttft={ttf_str || undefined}
          usage={usageInfo || undefined} />
      </AccordionContent>
    </AccordionItem>}
    {error && <AccordionItem value="error">
      <AccordionTrigger className={cn(triggerClassName, !error ? "opacity-50" : "")} disabled={!error}>
        <div className="flex flex-row gap-2 justify-between w-full items-center">
          <div className="flex flex-row gap-2 items-center">
            <span className="font-semibold text-xs text-white">Error</span>
            <ExclamationTriangleIcon className="w-4 h-4 text-yellow-500" />

          </div>
          {!error && <span className="text-xs font-semibold">No error</span>}
        </div>
      </AccordionTrigger>
      <AccordionContent>
        <ErrorViewer error={error} />
      </AccordionContent>
    </AccordionItem>}
  </BaseSpanUIDetailsDisplay>
}