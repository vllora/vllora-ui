import { RunDTO, Span } from "@/types/common-type";
import { tryParseJson } from "./modelUtils";


export const convertRunToSpan = (run: RunDTO, isInProgress?: boolean) => {
    let span: Span = {
        run_id: run.run_id!,
        trace_id: run.trace_ids && run.trace_ids.length > 0 ? run.trace_ids[0] : '',
        span_id: run.root_span_ids && run.root_span_ids.length > 0 ? run.root_span_ids[0] : '',
        thread_id: run.thread_ids && run.thread_ids.length > 0 ? run.thread_ids[0] : '',
        operation_name: 'run',
        start_time_us: run.start_time_us,
        finish_time_us: run.finish_time_us,
        attribute: {},
        isInProgress: isInProgress,
    }
    return span;
}


export const getDataFromSpan = (span: Span) => {
    let cost = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let errors: string[] = [];
    if(span.operation_name === 'model_call') {
        let spanAttribute = span.attribute as any;
        let costStr = spanAttribute?.cost;
        if(costStr){
            let costJson = tryParseJson(costStr);
            if(costJson){
                cost = costJson.cost ? costJson.cost : 0;
            }
        }
        let usageStr = spanAttribute?.usage;
        if(usageStr){
            let usageJson = tryParseJson(usageStr);
            if(usageJson){
                inputTokens = usageJson.input_tokens ? usageJson.input_tokens : 0;
                outputTokens = usageJson.output_tokens ? usageJson.output_tokens : 0;
            }
        }
    }
    return {cost, inputTokens, outputTokens, errors};
}

export const convertSpanToRun = (span: Span, prevRun?: RunDTO): RunDTO => {
    let {cost, inputTokens, outputTokens, errors} = getDataFromSpan(span);
    if(!prevRun) {
        let run: RunDTO = {
            run_id: span.run_id,
            trace_ids: span.trace_id ? [span.trace_id] : [],
            thread_ids: span.thread_id ? [span.thread_id] : [],
            root_span_ids: span.span_id ? [span.span_id] : [],
            start_time_us: span.start_time_us,
            finish_time_us: span.finish_time_us || Date.now() * 1000,
            cost: cost,
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            errors: errors,
            used_models: [],
            request_models: [],
            used_tools: [],
            mcp_template_definition_ids: []
        }
        return run;
    } else {
        return {
            ...prevRun,
            cost: cost + (prevRun.cost || 0),
            input_tokens: inputTokens + (prevRun.input_tokens || 0),
            output_tokens: outputTokens + (prevRun.output_tokens || 0),
            errors: [...prevRun.errors, ...errors],
        }
    }
   
}
    