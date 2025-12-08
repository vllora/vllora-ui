import { Handle, Position } from "@xyflow/react";

// Simplified handles - floating edges calculate positions dynamically
// These handles are just for visual consistency and potential manual connections
export const DynamicHandles = () => {
  return (
    <>
      <Handle type="target" position={Position.Top} id="top" className="!opacity-0 !w-1 !h-1" />
      <Handle type="target" position={Position.Bottom} id="bottom" className="!opacity-0 !w-1 !h-1" />
      <Handle type="target" position={Position.Left} id="left" className="!opacity-0 !w-1 !h-1" />
      <Handle type="target" position={Position.Right} id="right" className="!opacity-0 !w-1 !h-1" />
    </>
  );
};
