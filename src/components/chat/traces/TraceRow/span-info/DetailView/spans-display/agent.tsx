import { BaseSpanUIDetailsDisplay } from ".."
import { Span } from "@/types/common-type";
import { OtherPropertyViewer } from "../other-property-viewer";

interface AgentUIDisplayProps {
    span: Span;
}

export const AgentUIDisplay = ({ span }: AgentUIDisplayProps) => {
    const attributes = span.attribute as any;

    const otherProps = attributes;

    return (
        <BaseSpanUIDetailsDisplay>
            <div className="flex flex-col gap-6 pb-4 divide-y divide-border/40">

                {otherProps && <>
                    <OtherPropertyViewer label="Properties" attributes={otherProps} />
                </>}
            </div>

        </BaseSpanUIDetailsDisplay>
    );
}