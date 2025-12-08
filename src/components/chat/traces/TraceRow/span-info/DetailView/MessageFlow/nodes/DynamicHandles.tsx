import { Handle, Position } from "@xyflow/react";

interface DynamicHandlesProps {
  inputHandles: string[] | undefined;
  inputAngles: Record<string, number> | undefined;
}

const getHandlePosition = (angle: number): Position => {
  const sinAngle = Math.sin(angle);
  const cosAngle = Math.cos(angle);

  // Determine which edge based on angle of input node
  // Use threshold of 0.7 (~45°) to determine primary direction
  if (sinAngle < -0.7) {
    // Input is above → handle on TOP edge
    return Position.Top;
  } else if (sinAngle > 0.7) {
    // Input is below → handle on BOTTOM edge
    return Position.Bottom;
  } else if (cosAngle > 0.7) {
    // Input is to the right → handle on RIGHT edge
    return Position.Right;
  } else {
    // Input is to the left → handle on LEFT edge
    return Position.Left;
  }
};

export const DynamicHandles = ({ inputHandles, inputAngles }: DynamicHandlesProps) => {
  if (!inputHandles || inputHandles.length === 0) {
    return (
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-[#30363d] !w-0 !h-0 !border-0"
      />
    );
  }

  return (
    <>
      {inputHandles.map((handleId) => {
        const angle = inputAngles?.[handleId];
        if (angle === undefined) return null;

        const position = getHandlePosition(angle);

        return (
          <Handle
            key={handleId}
            type="target"
            position={position}
            id={handleId}
            className="!bg-[#30363d] !w-0 !h-0 !border-0"
          />
        );
      })}
    </>
  );
};
