import { ModelCall, RouterCall, Span, ToolCall } from "@/services/runs-api";

export const getSpanName = (span: Span): string | undefined => {
    let name = undefined;
    if (span.operation_name === "model_call") {
      let attributes = span.attribute as ModelCall;
      name = attributes?.label ?? attributes.model.name;
    } else if (span.operation_name === "tool") {
      name = span?.attribute?.label ?? (span.attribute as ToolCall).tool_name;
    } else if (span.operation_name === "request_routing") {
      name = span?.attribute?.label ?? ((span.attribute as RouterCall).router_name ?? 'router');
    } else {
      name = span?.attribute?.label ?? span.operation_name;
    }
    return name;
  }