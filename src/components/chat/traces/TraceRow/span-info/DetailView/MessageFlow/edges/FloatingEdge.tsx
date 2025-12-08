import { Position, getBezierPath, useInternalNode, InternalNode } from '@xyflow/react';
import type { EdgeProps, Node } from '@xyflow/react';

// Get connection parameters for an edge between two nodes
function getEdgeParams(source: InternalNode<Node>, target: InternalNode<Node>) {
  // Get node dimensions - prefer data.nodeWidth, then measured, then fallback
  const sourceData = source.data as Record<string, unknown> | undefined;
  const targetData = target.data as Record<string, unknown> | undefined;

  const sourceWidth = (sourceData?.nodeWidth as number) || source.measured?.width || 220;
  const sourceHeight = source.measured?.height || 80;
  const targetWidth = (targetData?.nodeWidth as number) || target.measured?.width || 220;
  const targetHeight = target.measured?.height || 80;

  // Calculate actual centers
  const sourceCenterX = source.internals.positionAbsolute.x + sourceWidth / 2;
  const sourceCenterY = source.internals.positionAbsolute.y + sourceHeight / 2;
  const targetCenterX = target.internals.positionAbsolute.x + targetWidth / 2;
  const targetCenterY = target.internals.positionAbsolute.y + targetHeight / 2;

  const horizontalDiff = Math.abs(sourceCenterX - targetCenterX);
  const verticalDiff = Math.abs(sourceCenterY - targetCenterY);

  // Determine positions based on relative node positions
  let sourcePos: Position;
  let targetPos: Position;
  let sx: number;
  let sy: number;
  let tx: number;
  let ty: number;

  if (horizontalDiff > verticalDiff) {
    // Horizontal connection - connect from left/right sides
    if (sourceCenterX > targetCenterX) {
      sourcePos = Position.Left;
      targetPos = Position.Right;
      sx = source.internals.positionAbsolute.x;
      tx = target.internals.positionAbsolute.x + targetWidth;
    } else {
      sourcePos = Position.Right;
      targetPos = Position.Left;
      sx = source.internals.positionAbsolute.x + sourceWidth;
      tx = target.internals.positionAbsolute.x;
    }
    // Y stays at vertical center
    sy = sourceCenterY;
    ty = targetCenterY;
  } else {
    // Vertical connection - connect from top/bottom sides
    if (sourceCenterY > targetCenterY) {
      sourcePos = Position.Top;
      targetPos = Position.Bottom;
      sy = source.internals.positionAbsolute.y;
      ty = target.internals.positionAbsolute.y + targetHeight;
    } else {
      sourcePos = Position.Bottom;
      targetPos = Position.Top;
      sy = source.internals.positionAbsolute.y + sourceHeight;
      ty = target.internals.positionAbsolute.y;
    }
    // X stays at horizontal center
    sx = sourceCenterX;
    tx = targetCenterX;
  }

  return { sx, sy, tx, ty, sourcePos, targetPos };
}

export function FloatingEdge({ id, source, target, style }: EdgeProps) {
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);

  if (!sourceNode || !targetNode) {
    return null;
  }

  const { sx, sy, tx, ty, sourcePos, targetPos } = getEdgeParams(sourceNode, targetNode);

  // Small hack to display gradient for straight lines
  const xEqual = sx === tx;
  const yEqual = sy === ty;

  const [edgePath] = getBezierPath({
    sourceX: xEqual ? sx + 0.0001 : sx,
    sourceY: yEqual ? sy + 0.0001 : sy,
    sourcePosition: sourcePos,
    targetPosition: targetPos,
    targetX: tx,
    targetY: ty,
  });

  // Extract stroke color from style for gradient
  const strokeColor = (style?.stroke as string) || '#60a5fa';

  return (
    <>
      <defs>
        <linearGradient id={`gradient-${id}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={strokeColor} stopOpacity="0.4" />
          <stop offset="100%" stopColor={strokeColor} stopOpacity="1" />
        </linearGradient>
        {/* Arrow marker */}
        <marker
          id={`arrow-${id}`}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={strokeColor} />
        </marker>
      </defs>
      {/* Outer glow */}
      <path
        d={edgePath}
        fill="none"
        stroke={strokeColor}
        strokeWidth={10}
        strokeOpacity={0.1}
        strokeLinecap="round"
      />
      {/* Middle glow */}
      <path
        d={edgePath}
        fill="none"
        stroke={strokeColor}
        strokeWidth={5}
        strokeOpacity={0.2}
        strokeLinecap="round"
      />
      {/* Main edge with gradient and arrow */}
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={`url(#gradient-${id})`}
        strokeWidth={2}
        strokeLinecap="round"
        markerEnd={`url(#arrow-${id})`}
        className="react-flow__edge-path"
      />
    </>
  );
}
