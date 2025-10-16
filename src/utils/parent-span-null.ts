import { Span } from "@/types/common-type";


export const isParentSpanNull = (span: Span) => {
    return !span.parent_span_id || span.parent_span_id === 'null'  || span.parent_span_id === '0' || span.parent_span_id === "0000000000000000" || span.parent_span_id === undefined;
}