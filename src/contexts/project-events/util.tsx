import { LangDBEventSpan, ThreadEventValue } from "./dto"
import { MessageThread, Span } from "@/types/common-type";


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

export const convertToThreadInfo = (eventThread: ThreadEventValue): MessageThread => {
    let createdAt = eventThread.created_at ? new Date(Date.parse(eventThread.created_at + 'Z')).toString() : '';
    let updatedAt = eventThread.updated_at ? new Date(Date.parse(eventThread.updated_at + 'Z')).toString() : '';
    let result: MessageThread = {
        id: eventThread.id,
        cost: eventThread.cost,
        output_tokens: eventThread.output_tokens,
        input_tokens: eventThread.input_tokens,
        project_id: eventThread.project_id ?? '',
        mcp_template_definition_ids: eventThread.mcp_template_definition_ids,
        description: eventThread.description ?? '',
        model_name: eventThread.model_name ?? '',
        user_id: '',
        created_at: createdAt ?? '',
        updated_at: updatedAt ?? '',
        score: eventThread.score,
        title: eventThread.title ?? '',
        tags_info: eventThread.tags_info ?? [],
        errors: eventThread.errors,
        input_models: eventThread.input_models,
        is_public: eventThread.is_public ?? false,
    }
    return result;
}