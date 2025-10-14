import { useState } from "react";
import { Hierarchy } from "@/contexts/RunDetailContext";
import { getSpanTitle, getOperationIcon, getOperationIconColor, getTimelineBgColor } from "./utils";
import { TimelineRow } from "./timeline-row";
import { skipThisSpan, isClientSDK } from "@/utils/graph-utils";
import { Span } from "@/types/common-type";

export interface HierarchyRowProps {
    hierarchy: Hierarchy;
    totalDuration: number;
    startTime: number;
    level: number;
    titleWidth?: number | string;
    relatedSpans?: Span[];
}

export const HierarchyRow = (props: HierarchyRowProps) => {
    const { hierarchy, totalDuration, startTime, level, titleWidth: propTitleWidth = 180, relatedSpans = [] } = props;
    const [isOpen, setIsOpen] = useState(false);

    // In ellora-ui, we're always in sidebar mode (chat sidebar)
    const titleWidth: string | number = `${propTitleWidth}px`.replace('pxpx', 'px');

    let root = hierarchy.root;
    let children = hierarchy.children;
    let isClientSDKTrace = isClientSDK(root);
    let skipCondition = skipThisSpan(root, isClientSDKTrace)
    let isSingleTrace = level == 0 && hierarchy.children.length === 0;
    // Skip certain operation types and render their children directly
    if (skipCondition && !isSingleTrace) {
        if (children && children.length > 0) {
            return (
                <div key={root.span_id} className="flex flex-col divide-y divide-border">
                    {children.map(child => (
                        <HierarchyRow
                            level={level}
                            key={child.root.span_id}
                            hierarchy={child}
                            totalDuration={totalDuration}
                            startTime={startTime}
                            titleWidth={titleWidth}
                            relatedSpans={relatedSpans}
                        />
                    ))}
                </div>
            );
        } else {
            return <></>
        }
    }

    // Calculate duration and position for the timeline bar
    const duration = root.finish_time_us - root.start_time_us;
    const toPercent = (value: number) => Number.isFinite(value) ? value : 0;
    const clamp = (value: number, max = 100) => Math.min(max, Math.max(0, value));
    const rawWidth = toPercent((duration / totalDuration) * 100);
    const rawOffset = toPercent(((root.start_time_us - startTime) / totalDuration) * 100);
    const offsetPercentNumber = clamp(rawOffset);
    const widthPercentNumber = clamp(rawWidth, 100 - offsetPercentNumber);
    const formatPercent = (value: number) => Number(value.toFixed(3)).toString();
    const widthPercent = formatPercent(widthPercentNumber);
    const offsetPercent = formatPercent(offsetPercentNumber);
    const durationSeconds = (duration / 1000000);

    // Get operation name and icon
    const spanTitle = getSpanTitle({ span: root, relatedSpans });
    // Ensure title is always a string
    const title = spanTitle || root.operation_name || 'Unknown';
    let operationIcon = getOperationIcon({ span: root, relatedSpans });


    const operationIconColor = getOperationIconColor({ span: root, relatedSpans });
    const timelineBgColor = getTimelineBgColor({ span: root, relatedSpans });

    // Leaf node (no children)
    if (children.length === 0) {
        return (
            <TimelineRow
                span={root}
                level={level}
                hasChildren={false}
                isOpen={false}
                titleWidth={titleWidth}
                title={title}
                operationIcon={operationIcon}
                operationIconColor={operationIconColor}
                durationSeconds={durationSeconds}
                widthPercent={widthPercent}
                offsetPercent={offsetPercent}
                onToggle={() => { }}
                timelineBgColor={timelineBgColor}
            />
        );
    }

    return (
        <div className="flex flex-col divide-y divide-border">
            <TimelineRow
                span={root}
                level={level}
                hasChildren={true}
                isOpen={isOpen}
                titleWidth={titleWidth}
                title={title}
                operationIcon={operationIcon}
                operationIconColor={operationIconColor}
                durationSeconds={durationSeconds}
                widthPercent={widthPercent}
                offsetPercent={offsetPercent}
                onToggle={() => setIsOpen(!isOpen)}
                timelineBgColor={timelineBgColor}
            />
            <div className="flex flex-col divide-y divide-border">
                {children.map(child => (
                    <HierarchyRow
                        level={level + 1}
                        key={child.root.span_id}
                        hierarchy={child}
                        totalDuration={totalDuration}
                        startTime={startTime}
                        titleWidth={titleWidth}
                        relatedSpans={relatedSpans}
                    />
                ))}
            </div>
        </div>
    );
}
