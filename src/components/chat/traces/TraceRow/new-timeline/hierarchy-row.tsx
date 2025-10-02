import { useState } from "react";
import { Hierarchy, RunDetailConsumer } from "@/contexts/RunDetailContext";
import { getSpanTitle, getOperationIcon, getOperationIconColor, getTimelineBgColor } from "./utils";
import { TimelineRow } from "./timeline-row";
import { ToolCall } from "@/services/runs-api";
import { skipThisSpan, getMCPDefinitionId, getMCPTemplateName, isClientSDK, isMCP } from "@/utils/graph-utils";
export interface HierarchyRowProps {
    hierarchy: Hierarchy;
    totalDuration: number;
    startTime: number;
    level: number;
    titleWidth?: number | string;
}

export const HierarchyRow = (props: HierarchyRowProps) => {
    const { hierarchy, totalDuration, startTime, level, titleWidth: propTitleWidth = 180 } = props;
    const [isOpen, setIsOpen] = useState(false); // Auto-expand first level

    const { mcpTemplates } = MCPTemplatesConsumer();
    // Simple approach: use CSS units directly
    // 20vw when not in sidebar, 170px in sidebar mode
    // Ensure titleWidth is always defined for TimelineRow component
    const pathname = usePathname();
    const params = useParams();
    const isInSidebar = pathname !== `/projects/${params?.projectId}/traces`;
    const titleWidth: string | number = isInSidebar ? `${propTitleWidth}px`.replace('pxpx', 'px') : '20vw';

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
                        />
                    ))}
                </div>
            );
        } else {
            return <></>
        }
    }

    // Get context data at the component level
    const { spans } = RunDetailConsumer();

    // Calculate duration and position for the timeline bar
    const duration = root.finish_time_us - root.start_time_us;
    const widthPercent = (duration / totalDuration * 100).toFixed(0);
    const offsetPercent = (((root.start_time_us - startTime) / totalDuration) * 100).toFixed(0);
    const durationSeconds = (duration / 1000000);

    // Get operation name and icon
    const spanTitle = getSpanTitle({ span: root, relatedSpans: spans });
    // Ensure title is always a string
    const title = spanTitle || root.operation_name || 'Unknown';
    let operationIcon = getOperationIcon({ span: root, relatedSpans: spans });

    // Check if this is an MCP span by safely checking for mcp_server property
    const isMCPSpan = isMCP(root);
    if (isMCPSpan) {
        let templateName = getMCPTemplateName(root);
        let mcp_template_definition_id = getMCPDefinitionId(root);
        const mcpServerTemplate: MCPServerTemplate | undefined = mcpTemplates?.templates.find((s: MCPServerTemplate) => s.definition_id.toLowerCase() === templateName.toLowerCase() ||
         (mcp_template_definition_id && s.definition_id.toLowerCase() === mcp_template_definition_id.toLowerCase()) 
         || (templateName && templateName.toLowerCase() === s.definition.name.toLowerCase()));
        if (mcpServerTemplate && mcpServerTemplate.definition.logo) {
            operationIcon = <ImageFallback src={mcpServerTemplate.definition.logo} alt={mcpServerTemplate.definition.name} width={16} height={16} className="rounded-full object-contain w-4 h-4" />;
        }
    }

    const operationIconColor = getOperationIconColor({ span: root, relatedSpans: spans });
    const timelineBgColor = getTimelineBgColor({ span: root, relatedSpans: spans });

    // Calculate finish time for parent span if it has children
    let finish_time_us = children.length > 0
        ? children.reduce((min, child) => Math.min(min, child.root.start_time_us), root.finish_time_us)
        : root.finish_time_us;

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
                isInSidebar={isInSidebar}
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
                isInSidebar={isInSidebar}
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
                    />
                ))}
            </div>
        </div>
    );
}
