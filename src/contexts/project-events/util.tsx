import { tryParseJson } from "@/utils/modelUtils";
import { LangDBEventSpan, ThreadEventValue } from "./dto"
import { RunDTO, Span } from "@/types/common-type";
import { Thread } from "@/types/chat";


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

export const convertToThreadInfo = (eventThread: ThreadEventValue): Thread => {
    let result: Thread = {
        id: eventThread.id,
        cost: eventThread.cost,
        output_tokens: eventThread.output_tokens,
        input_tokens: eventThread.input_tokens,
        project_id: eventThread.project_id ?? '',
        mcp_template_definition_ids: eventThread.mcp_template_definition_ids,
        description: eventThread.description ?? '',
        model_name: eventThread.model_name ?? '',
        user_id: '',
        created_at: eventThread.created_at ?? '',
        updated_at: eventThread.updated_at ?? '',
        score: eventThread.score,
        title: eventThread.title ?? '',
        tags_info: eventThread.tags_info ?? [],
        errors: eventThread.errors,
        input_models: eventThread.input_models,
        is_public: eventThread.is_public ?? false,
        is_from_local:false
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

export const convertSpanToRunDTO = (span: Span, prevDTO?: RunDTO): RunDTO => {
    let defaultDTO: RunDTO = {
      run_id: span.run_id,
      thread_ids: span.thread_id ? [span.thread_id] : [],
      trace_ids: span.trace_id ? [span.trace_id] : [],
      used_models: [],
      mcp_template_definition_ids: [],
      used_tools: [],
      request_models: [],
      input_tokens: 0,
      output_tokens: 0,
      start_time_us: span.start_time_us,
      finish_time_us: span.finish_time_us,
      errors: [],
      cost: 0,
    };
  
    let result = prevDTO ? { ...prevDTO } : { ...defaultDTO };
    if (span.operation_name === "api_invoke") {
      let att_api_invoke = span.attribute as any;
      let api_request_str = att_api_invoke.request;
      let api_request = tryParseJson(api_request_str);
      if (api_request) {
        if (api_request.model) {
          if (!result.request_models || result.request_models.length === 0) {
            result.request_models = [api_request.model];
          } else {
            let newArray = [...result.request_models, api_request.model];
            let uniqueArray = newArray.filter(
              (value, index) => newArray.indexOf(value) === index
            );
            result.request_models = uniqueArray;
          }
        }
      }
      if (att_api_invoke.cost) {
        let cost = tryParseJson(att_api_invoke.cost);
        if (cost) {
          result.cost += cost.cost;
        }
      }
    }
    if(span.operation_name === 'model_call') {
      let att_model_call = span.attribute as any;
      if(att_model_call.usage) {
        let usage = tryParseJson(att_model_call.usage);
        if(usage) {
          result.input_tokens += usage.input_tokens;
          result.output_tokens += usage.output_tokens;
        }
      }
      if(att_model_call.model_name) {
        if (!result.request_models || result.request_models.length === 0) {
          result.request_models = [att_model_call.model_name];
        } else {
          let newArray = [...result.request_models, att_model_call.model_name];
          let uniqueArray = newArray.filter(
            (value, index) => newArray.indexOf(value) === index
          );
          result.request_models = uniqueArray;
        }
      }
    }
    result.finish_time_us = span.finish_time_us;
    return result;
  };