import { EdgeProps, getBezierPath, BaseEdge } from '@xyflow/react';

interface PipelineEdgeData {
  status: 'inactive' | 'active' | 'running';
}

export function PipelineEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}: EdgeProps) {
  const edgeData = data as PipelineEdgeData | undefined;
  const status = edgeData?.status || 'inactive';

  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.25,
  });

  // Determine edge style based on status
  const getEdgeStyle = () => {
    switch (status) {
      case 'active':
        return {
          stroke: 'rgb(34, 197, 94)', // green-500
          strokeWidth: 2,
          strokeDasharray: 'none',
        };
      case 'running':
        return {
          stroke: 'rgb(59, 130, 246)', // blue-500
          strokeWidth: 2,
          strokeDasharray: '8 4',
        };
      case 'inactive':
      default:
        return {
          stroke: 'rgb(63, 63, 70)', // zinc-700
          strokeWidth: 1.5,
          strokeDasharray: '4 4',
        };
    }
  };

  const style = getEdgeStyle();

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      style={style}
      markerEnd={markerEnd}
    />
  );
}
