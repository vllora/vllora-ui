
import {  memo } from "react";
import { ToolStartMessageDisplay } from "../ToolStartMessageDisplay";

export const VloraToolSpanMessage = memo((props: {
    span_id: string;
}) => {
    const { span_id } = props;
    return (
        <div id={`vlora-tool-span-conversation-${span_id}`} className="">
            <ToolStartMessageDisplay spanId={span_id} />
        </div>
    );
}, (prev, next) => {
    // Fast path: if messages array reference is the same, check other props only
    if (prev.span_id === next.span_id) {
        return true;
    }

    // Quick checks first (cheapest comparisons)
    if (prev.span_id !== next.span_id) return false;
    return true;
});