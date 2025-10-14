import { GuardUIDetailsDisplay } from "./spans-display/guard-display";
import { ModelInvokeUIDetailsDisplay } from "./spans-display/model-display";
import { ToolUIDetailsDisplay } from "./spans-display/tool-display";
import { ModelCallUIDetailsDisplay } from "./spans-display/model-call-display";
import { ApiInvokeUIDetailsDisplay } from "./spans-display/api-invoke-display";
import { VirtualModelCallUIDetailsDisplay } from "./spans-display/virtual-model-display";
import { ClientActivityUIDetailsDisplay } from "./spans-display/client-span";
import { CloudApiInvokeUIDetailsDisplay } from "./spans-display/cloud-api-invoke-display";
import { isClientSDK } from "@/utils/graph-utils";
import { Span } from "@/types/common-type";
import { isActualModelCall } from "./index";

interface BaseSpanUIDisplayProps {
  span: Span;
  relatedSpans?: Span[];
}

/**
 * Base component that routes to the appropriate span display component based on operation_name.
 * This component contains the shared routing logic used by both:
 * - SpanUIDetailsDisplay (chat traces view with ChatWindowContext)
 * - StandaloneSpanUIDetailsDisplay (debug console without ChatWindowContext)
 */
export const BaseSpanUIDisplay = ({ span, relatedSpans = [] }: BaseSpanUIDisplayProps) => {
  const operation_name = span.operation_name;
  const isClientSDKSpan = isClientSDK(span);

  if (isClientSDKSpan) {
    return <ClientActivityUIDetailsDisplay span={span} />;
  }

  if (operation_name && operation_name.startsWith('guard_')) {
    return <GuardUIDetailsDisplay span={span} />;
  }

  if (operation_name && operation_name.startsWith('tools')) {
    return <ToolUIDetailsDisplay span={span} relatedSpans={relatedSpans} />;
  }

  if (operation_name === 'virtual_model') {
    return <VirtualModelCallUIDetailsDisplay span={span} relatedSpans={relatedSpans} />;
  }

  if (isActualModelCall(span)) {
    return <ModelInvokeUIDetailsDisplay span={span} relatedSpans={relatedSpans} />;
  }

  if (operation_name === 'model_call') {
    return <ModelCallUIDetailsDisplay span={span} relatedSpans={relatedSpans} />;
  }

  if (operation_name === 'api_invoke') {
    return <ApiInvokeUIDetailsDisplay span={span} relatedSpans={relatedSpans} />;
  }

  if (operation_name === 'cloud_api_invoke') {
    return <CloudApiInvokeUIDetailsDisplay span={span} relatedSpans={relatedSpans} />;
  }

  return null;
};
