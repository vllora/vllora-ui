import { BaseEdge, EdgeProps, getSmoothStepPath } from '@xyflow/react';

export const OffsetSmoothStepEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
  label,
  labelStyle,
  labelBgStyle,
  data,
}: EdgeProps) => {
  const offset = (data?.offset as number) || 50;

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    offset,
  });

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      style={style}
      markerEnd={markerEnd}
      label={label}
      labelStyle={labelStyle}
      labelBgStyle={labelBgStyle}
      labelX={labelX}
      labelY={labelY}
    />
  );
};
