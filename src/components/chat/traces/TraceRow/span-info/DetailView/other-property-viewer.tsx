import { JsonViewer } from "../JsonViewer";
import { ViewerCollapsibleSection } from "./ViewerCollapsibleSection";


export const OtherPropertyViewer = ({ attributes, label }: { attributes: any, label?: string }) => {
    return (
        <ViewerCollapsibleSection
            title={label || "Other Properties"}
            count={attributes.length}
            collapsed={false}
            onCollapsedChange={() => { }}
        >
            <JsonViewer data={attributes} />
        </ViewerCollapsibleSection>
    );
}