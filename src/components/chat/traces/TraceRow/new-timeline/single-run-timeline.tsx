import { HierarchyRow } from "./hierarchy-row";
import { RunDetailConsumer } from "@/contexts/RunDetailContext";
import { useCallback, useMemo, useState } from "react";
import { Span } from "@/types/common-type";
import { TIMELINE_DYNAMIC_TITLE_WIDTH_FULL_SIZE, TIMELINE_DYNAMIC_TITLE_WIDTH_IN_SIDEBAR } from "@/utils/constant";
import { getUniqueMessage, FlowDiagram, FlowNode, FlowEdge } from "@/hooks/useSpanById";
import { GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import {
    ReactFlow,
    Node,
    Edge,
    Background,
    Controls,
    useNodesState,
    useEdgesState,
    MarkerType,
    Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

export interface SingleRunTimelineViewProps {
    index: number;
    isInSidebar?: boolean;
    currentSpanHierarchy: Span;
    selectedSpanId?: string;
    onSpanSelect?: (spanId: string, runId?: string) => void;
    level: number;
    hoverSpanId?: string;
    collapsedSpans?: string[];
    onToggle?: (spanId: string) => void;
}

// Node styles for different types
const nodeStyles: Record<FlowNode['type'], { background: string; border: string; color: string }> = {
    system: { background: '#8b5cf6', border: '#7c3aed', color: '#ffffff' },
    user: { background: '#3b82f6', border: '#2563eb', color: '#ffffff' },
    model: { background: '#22c55e', border: '#16a34a', color: '#ffffff' },
    tool: { background: '#f97316', border: '#ea580c', color: '#ffffff' },
};

// Edge styles for different types
const edgeStyles: Record<FlowEdge['type'], { stroke: string; label: string }> = {
    input: { stroke: '#3b82f6', label: 'input' },
    tool_call: { stroke: '#f97316', label: 'call' },
    tool_response: { stroke: '#22c55e', label: 'response' },
    paired: { stroke: '#a855f7', label: 'paired' },
};

// Convert FlowDiagram to React Flow format
const convertToReactFlowFormat = (flowDiagram: FlowDiagram): { nodes: Node[]; edges: Edge[] } => {
    const { nodes: flowNodes, edges: flowEdges } = flowDiagram;

    // Group nodes by type for layout
    const systemNodes = flowNodes.filter(n => n.type === 'system');
    const userNodes = flowNodes.filter(n => n.type === 'user');
    const modelNodes = flowNodes.filter(n => n.type === 'model');
    const toolNodes = flowNodes.filter(n => n.type === 'tool');

    // Calculate positions
    const NODE_WIDTH = 150;
    const HORIZONTAL_GAP = 30;
    const VERTICAL_GAP = 100;

    // Position nodes in rows
    const inputNodes = [...systemNodes, ...userNodes];
    const inputRowWidth = inputNodes.length * NODE_WIDTH + (inputNodes.length - 1) * HORIZONTAL_GAP;
    const modelRowWidth = modelNodes.length * NODE_WIDTH + (modelNodes.length - 1) * HORIZONTAL_GAP;
    const toolRowWidth = toolNodes.length * NODE_WIDTH + (toolNodes.length - 1) * HORIZONTAL_GAP;
    const maxWidth = Math.max(inputRowWidth, modelRowWidth, toolRowWidth, 400);

    const nodes: Node[] = [];

    // Row 1: System and User nodes
    inputNodes.forEach((node, index) => {
        const startX = (maxWidth - inputRowWidth) / 2;
        nodes.push({
            id: node.id,
            type: 'default',
            position: { x: startX + index * (NODE_WIDTH + HORIZONTAL_GAP), y: 0 },
            data: { label: node.label },
            style: {
                background: nodeStyles[node.type].background,
                border: `2px solid ${nodeStyles[node.type].border}`,
                color: nodeStyles[node.type].color,
                borderRadius: '8px',
                padding: '10px',
                fontSize: '12px',
                fontWeight: 'bold',
                width: NODE_WIDTH,
            },
            sourcePosition: Position.Bottom,
            targetPosition: Position.Top,
        });
    });

    // Row 2: Model nodes
    modelNodes.forEach((node, index) => {
        const startX = (maxWidth - modelRowWidth) / 2;
        nodes.push({
            id: node.id,
            type: 'default',
            position: { x: startX + index * (NODE_WIDTH + HORIZONTAL_GAP), y: VERTICAL_GAP },
            data: { label: node.label },
            style: {
                background: nodeStyles[node.type].background,
                border: `2px solid ${nodeStyles[node.type].border}`,
                color: nodeStyles[node.type].color,
                borderRadius: '8px',
                padding: '10px',
                fontSize: '12px',
                fontWeight: 'bold',
                width: NODE_WIDTH,
            },
            sourcePosition: Position.Bottom,
            targetPosition: Position.Top,
        });
    });

    // Row 3: Tool nodes
    toolNodes.forEach((node, index) => {
        const startX = (maxWidth - toolRowWidth) / 2;
        nodes.push({
            id: node.id,
            type: 'default',
            position: { x: startX + index * (NODE_WIDTH + HORIZONTAL_GAP), y: VERTICAL_GAP * 2 },
            data: { label: node.label },
            style: {
                background: nodeStyles[node.type].background,
                border: `2px solid ${nodeStyles[node.type].border}`,
                color: nodeStyles[node.type].color,
                borderRadius: '8px',
                padding: '10px',
                fontSize: '12px',
                fontWeight: 'bold',
                width: NODE_WIDTH,
            },
            sourcePosition: Position.Bottom,
            targetPosition: Position.Top,
        });
    });

    // Convert edges - show call group to indicate which inputs belong to same LLM call
    const edges: Edge[] = flowEdges.map((edge) => {
        const isPaired = edge.type === 'paired';
        return {
            id: `e${edge.index}-${edge.source}-${edge.target}`,
            source: edge.source,
            target: edge.target,
            // For paired edges, use Right/Left positions for horizontal connection
            sourceHandle: isPaired ? 'right' : undefined,
            targetHandle: isPaired ? 'left' : undefined,
            label: edge.callGroup ? `C${edge.callGroup}` : `#${edge.index}`,
            labelStyle: { fontSize: '10px', fill: '#666' },
            labelBgStyle: { fill: '#fff', fillOpacity: 0.8 },
            style: {
                stroke: edgeStyles[edge.type].stroke,
                strokeWidth: 2,
                strokeDasharray: isPaired ? '5,5' : undefined, // Dashed for paired
            },
            markerEnd: {
                type: MarkerType.ArrowClosed,
                color: edgeStyles[edge.type].stroke,
            },
            animated: edge.type === 'tool_call',
        };
    });

    return { nodes, edges };
};

// Flow visualization component using React Flow
const FlowVisualization = ({ flowDiagram }: { flowDiagram: FlowDiagram }) => {
    const { nodes: initialNodes, edges: initialEdges } = useMemo(
        () => convertToReactFlowFormat(flowDiagram),
        [flowDiagram]
    );

    const [nodes, , onNodesChange] = useNodesState(initialNodes);
    const [edges, , onEdgesChange] = useEdgesState(initialEdges);

    if (flowDiagram.nodes.length === 0) {
        return (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
                No flow data available
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* React Flow diagram */}
            <div className="h-[400px] border rounded-lg overflow-hidden bg-background">
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    fitView
                    fitViewOptions={{ padding: 0.2 }}
                    attributionPosition="bottom-left"
                >
                    <Background color="#aaa" gap={16} />
                    <Controls />
                </ReactFlow>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-4 text-xs">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded" style={{ background: nodeStyles.system.background }} />
                    <span>System Prompt</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded" style={{ background: nodeStyles.user.background }} />
                    <span>User</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded" style={{ background: nodeStyles.model.background }} />
                    <span>Model</span>
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded" style={{ background: nodeStyles.tool.background }} />
                    <span>Tool</span>
                </div>
            </div>

            {/* Edges summary */}
            <div className="text-xs text-muted-foreground space-y-1">
                <div>
                    {flowDiagram.edges.length} edges: {' '}
                    {flowDiagram.edges.filter(e => e.type === 'paired').length} paired, {' '}
                    {flowDiagram.edges.filter(e => e.type === 'input').length} inputs, {' '}
                    {flowDiagram.edges.filter(e => e.type === 'tool_call').length} tool calls, {' '}
                    {flowDiagram.edges.filter(e => e.type === 'tool_response').length} tool responses
                </div>
                <div className="text-muted-foreground/70">
                    C1, C2... = Call groups (System+User with same Cx were sent together in same LLM call)
                </div>
            </div>
        </div>
    );
};

export const SingleRunTimelineView = (props: SingleRunTimelineViewProps) => {
    const { isInSidebar = true, selectedSpanId, onSpanSelect, currentSpanHierarchy, level, index, hoverSpanId, collapsedSpans, onToggle } = props;
    const { spansByRunId, startTime, totalDuration } = RunDetailConsumer();

    const [isFlowDialogOpen, setIsFlowDialogOpen] = useState(false);

    const { flowDiagram } = useMemo(() => {
        if (spansByRunId && spansByRunId.length > 0) {
            return getUniqueMessage({ flattenSpans: spansByRunId });
        }
        return { messages: [], flowDiagram: { nodes: [], edges: [] } };
    }, [spansByRunId]);

    // Dynamic title width based on display mode - wider when not in sidebar
    const titleWidth: string | number = useMemo(() => isInSidebar ? `${TIMELINE_DYNAMIC_TITLE_WIDTH_IN_SIDEBAR}px` : `${TIMELINE_DYNAMIC_TITLE_WIDTH_FULL_SIZE}px`, [isInSidebar]);

    // Calculate total duration and start time for width calculations

    return (
        <div className="flex flex-col space-y-1 divide-y divide-border/50 first:mt-0">
            {/* Timeline header with ticks */}
            {index === 0 && (
                <div className="flex flex-col">
                    <div className="flex w-full items-center">
                        <div style={{ width: titleWidth }} className="flex-shrink-0 flex items-center gap-2">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={() => setIsFlowDialogOpen(true)}
                                title="View Flow Diagram"
                            >
                                <GitBranch className="h-4 w-4" />
                            </Button>
                        </div>
                        <div className="flex-grow relative">
                            <div className="relative w-full h-5">
                                {/* Time markers */}
                                <div className="absolute left-0 bottom-1 text-[10px] text-white font-semibold whitespace-nowrap">0.0s</div>
                                <div className="absolute left-1/4 bottom-1 -translate-x-1/2 text-[10px] font-semibold text-white whitespace-nowrap">
                                    {(totalDuration * 0.25 / 1000000).toFixed(1)}s
                                </div>
                                <div className="absolute left-1/2 bottom-1 -translate-x-1/2 text-[10px] font-semibold text-white whitespace-nowrap">
                                    {(totalDuration * 0.5 / 1000000).toFixed(1)}s
                                </div>
                                <div className="absolute left-3/4 bottom-1 -translate-x-1/2 text-[10px] font-semibold text-white whitespace-nowrap">
                                    {(totalDuration * 0.75 / 1000000).toFixed(1)}s
                                </div>
                                <div className="absolute right-0 bottom-1 text-right text-[10px] font-semibold text-white whitespace-nowrap">
                                    {(totalDuration / 1000000).toFixed(1)}s
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Flow Diagram Dialog */}
            <Dialog open={isFlowDialogOpen} onOpenChange={setIsFlowDialogOpen}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Flow Diagram</DialogTitle>
                    </DialogHeader>
                    <FlowVisualization flowDiagram={flowDiagram} />
                </DialogContent>
            </Dialog>

            {/* Hierarchy tree with timeline bars */}
            <div className="overflow-hidden">
                <HierarchyRow
                    level={level}
                    key={`span-timeline-hierarchy-${currentSpanHierarchy.span_id}`}
                    hierarchy={currentSpanHierarchy}
                    totalDuration={totalDuration}
                    startTime={startTime}
                    titleWidth={titleWidth}
                    relatedSpans={spansByRunId}
                    selectedSpanId={selectedSpanId}
                    onSpanSelect={onSpanSelect}
                    isInSidebar={isInSidebar}
                    hoverSpanId={hoverSpanId}
                    collapsedSpans={collapsedSpans}
                    onToggle={onToggle}
                />
            </div>
        </div>
    );
}


