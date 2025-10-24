import { LangDBEventSpan } from "./dto"
import { Span } from "@/types/common-type";


export const convertToNormalSpan = (eventSpan: LangDBEventSpan): Span => {
  let result: Span = {
    trace_id: eventSpan.trace_id,
    span_id: eventSpan.span_id,
    thread_id: eventSpan.thread_id,
    parent_span_id: eventSpan.parent_span_id,
    operation_name: eventSpan.operation_name,
    start_time_us: eventSpan.start_time_unix_nano / 1000,
    finish_time_us: eventSpan.end_time_unix_nano / 1000,
    attribute: eventSpan.attribute || eventSpan.attributes || {},
    run_id: eventSpan.run_id,
    child_attribute: eventSpan.child_attribute,
    parent_trace_id: eventSpan.parent_trace_id,
  }
  return result;
}

export const getTokensInfo = (props: {
  spans: Span[],
}): {
  inputTokens: number,
  outputTokens: number,
  totalTokens: number
} => {
  const { spans } = props
  if (!spans || spans.length === 0) {
    return { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
  }
  return spans.reduce((acc, span) => {

    let usageAttribute: any = undefined;

    if (span.operation_name === 'model_call') {
      let attribute = span.attribute as {
        [key: string]: any
      };
      if (attribute && attribute['usage']) {
        usageAttribute = attribute['usage'] as any;
      }
    } else {
      if (span.child_attribute) {
        let childAttribute = span.child_attribute as {
          [key: string]: any
        };
        if (childAttribute && childAttribute['usage']) {
          usageAttribute = childAttribute['usage'] as any;
        }
      }
    }
    if (usageAttribute) {
      try {
        let usageJson = JSON.parse(usageAttribute) as {
          input_tokens: number,
          output_tokens: number,
          total_tokens: number
        }
        acc.inputTokens += usageJson.input_tokens;
        acc.outputTokens += usageJson.output_tokens;
        acc.totalTokens += usageJson.total_tokens;
      } catch (e) {
      }

    }
    return acc
  }, { inputTokens: 0, outputTokens: 0, totalTokens: 0 })
}

export const getTotalCost = (props: {
  spans: Span[],
}) => {
  const { spans } = props
  if (!spans || spans.length === 0) {
    return 0
  }
  return spans.reduce((acc, span) => {
    if (span.attribute) {
      let attribute = span.attribute as {
        [key: string]: any
      };
      if (attribute && attribute['cost']) {
        try {
          let costJson = JSON.parse(attribute['cost']) as {
            cost: number,
            per_input_token: number,
            per_output_token: number
          }
          acc += costJson.cost;
        } catch (e) {

        }
      }
    }
    return acc
  }, 0)
}
