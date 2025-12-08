import { getSpanTitle, getOperationIcon, getOperationIconColor, getTimelineBgColor } from "./utils";
import { TimelineRow } from "./timeline-row";
import { skipThisSpan, isClientSDK, isVlloraRunSpan } from "@/utils/graph-utils";
import { Span } from "@/types/common-type";
import { TIMELINE_DYNAMIC_TITLE_WIDTH_IN_SIDEBAR } from "@/utils/constant";

export interface HierarchyRowProps {
    hierarchy: Span;
    totalDuration: number;
    startTime: number;
    level: number;
    titleWidth?: number | string;
    relatedSpans?: Span[];
    selectedSpanId?: string;
    onSpanSelect?: (spanId: string, runId?: string) => void;
    isInSidebar?: boolean;
    hoverSpanId?: string;
    onHoverSpanChange?: (spanId: string | undefined) => void;
    collapsedSpans?: string[];
    onToggle?: (spanId: string) => void;
    showHighlightButton?: boolean;
}

export const HierarchyRow = (props: HierarchyRowProps) => {
    const { hierarchy, totalDuration, startTime, level, titleWidth: propTitleWidth = TIMELINE_DYNAMIC_TITLE_WIDTH_IN_SIDEBAR, relatedSpans = [], selectedSpanId, onSpanSelect, isInSidebar = true, hoverSpanId, onHoverSpanChange, collapsedSpans, onToggle, showHighlightButton } = props;
    // In ellora-ui, we're always in sidebar mode (chat sidebar)
    const titleWidth: string | number = `${propTitleWidth}px`.replace('pxpx', 'px');
    let root = hierarchy;
    let childrenSpan = hierarchy.spans || [];
    let isClientSDKTrace = isClientSDK(root);
    let skipCondition = skipThisSpan(root, isClientSDKTrace) || isVlloraRunSpan(root);
    let isSingleTrace = level == 0 && childrenSpan.length === 0;
    // Skip certain operation types and render their children directly
    if (skipCondition && !isSingleTrace) {
        if (childrenSpan && childrenSpan.length > 0) {
            return (
                <div key={`span-timeline-hierarchy-${root.span_id}`} className="flex flex-col divide-y divide-border/50">
                    {childrenSpan.map(child => (
                        <HierarchyRow
                            level={level}
                            key={`span-timeline-hierarchy-${child.span_id}`}
                            hierarchy={child}
                            totalDuration={totalDuration}
                            startTime={startTime}
                            titleWidth={titleWidth}
                            relatedSpans={relatedSpans}
                            selectedSpanId={selectedSpanId}
                            onSpanSelect={onSpanSelect}
                            isInSidebar={isInSidebar}
                            hoverSpanId={hoverSpanId}
                            onHoverSpanChange={onHoverSpanChange}
                            collapsedSpans={collapsedSpans}
                            onToggle={onToggle}
                            showHighlightButton={showHighlightButton}
                        />
                    ))}
                </div>
            );
        } else {
            return <></>
        }
    }

    // Calculate duration and position for the timeline bar
    const duration = root.finish_time_us ? root.finish_time_us - root.start_time_us : 0;
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
    if (childrenSpan.length === 0) {
        return (
            <TimelineRow
                span={root}
                level={level}
                hasChildren={false}
                collapsedSpans={[]}
                titleWidth={titleWidth}
                title={title}
                operationIcon={operationIcon}
                operationIconColor={operationIconColor}
                durationSeconds={durationSeconds}
                widthPercent={widthPercent}
                offsetPercent={offsetPercent}
                onToggle={() => { }}
                timelineBgColor={timelineBgColor}
                selectedSpanId={selectedSpanId}
                onSpanSelect={onSpanSelect}
                isInSidebar={isInSidebar}
                hoverSpanId={hoverSpanId}
                onHoverSpanChange={onHoverSpanChange}
                showHighlightButton={showHighlightButton}
            />
        );
    }

    return (
        <div className="flex flex-col divide-y divide-border/50 ">
            <TimelineRow
                span={root}
                level={level}
                hasChildren={true}
                collapsedSpans={collapsedSpans}
                titleWidth={titleWidth}
                title={title}
                operationIcon={operationIcon}
                operationIconColor={operationIconColor}
                durationSeconds={durationSeconds}
                widthPercent={widthPercent}
                offsetPercent={offsetPercent}
                onToggle={(v) => onToggle?.(v)}
                timelineBgColor={timelineBgColor}
                selectedSpanId={selectedSpanId}
                onSpanSelect={onSpanSelect}
                isInSidebar={isInSidebar}
                hoverSpanId={hoverSpanId}
                onHoverSpanChange={onHoverSpanChange}
                showHighlightButton={showHighlightButton}
            />
            {!(collapsedSpans?.includes(root.span_id)) && (
                <div className="flex flex-col divide-y divide-border/50">
                    {childrenSpan.map(child => (
                        <HierarchyRow
                            level={level + 1}
                            key={`span-timeline-hierarchy-${child.span_id}`}
                            hierarchy={child}
                            totalDuration={totalDuration}
                            startTime={startTime}
                            titleWidth={titleWidth}
                            relatedSpans={relatedSpans}
                            selectedSpanId={selectedSpanId}
                            onSpanSelect={onSpanSelect}
                            isInSidebar={isInSidebar}
                            hoverSpanId={hoverSpanId}
                            onHoverSpanChange={onHoverSpanChange}
                            collapsedSpans={collapsedSpans}
                            onToggle={(v) => onToggle?.(v)}
                            showHighlightButton={showHighlightButton}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
