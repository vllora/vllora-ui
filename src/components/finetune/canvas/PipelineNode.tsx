import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { PipelineNode, NodeStatus, PipelineStep } from '../types';
import { cn } from '@/lib/utils';
import {
  CheckCircle2,
  AlertTriangle,
  Circle,
  Loader2,
  XCircle,
  Download,
  FolderTree,
  BarChart3,
  Gauge,
  FlaskConical,
  GraduationCap,
  Rocket,
} from 'lucide-react';

interface PipelineNodeData extends PipelineNode {
  isSelected: boolean;
  onSelect: () => void;
}

// Get icon for each step
const getStepIcon = (stepId: PipelineStep) => {
  const icons: Record<PipelineStep, React.ElementType> = {
    1: Download,
    2: FolderTree,
    3: BarChart3,
    4: Gauge,
    5: FlaskConical,
    6: GraduationCap,
    7: Rocket,
  };
  return icons[stepId];
};

// Get status icon
const getStatusIcon = (status: NodeStatus) => {
  switch (status) {
    case 'complete':
      return <CheckCircle2 className="w-8 h-8 text-green-500" />;
    case 'running':
      return <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />;
    case 'attention':
      return <AlertTriangle className="w-8 h-8 text-yellow-500" />;
    case 'failed':
      return <XCircle className="w-8 h-8 text-red-500" />;
    case 'waiting':
    default:
      return <Circle className="w-8 h-8 text-zinc-600" />;
  }
};

// Get border color based on status
const getBorderColor = (status: NodeStatus, isSelected: boolean) => {
  if (isSelected) {
    return 'border-blue-500';
  }
  switch (status) {
    case 'complete':
      return 'border-green-500/50';
    case 'running':
      return 'border-blue-500/50';
    case 'attention':
      return 'border-yellow-500/50';
    case 'failed':
      return 'border-red-500/50';
    case 'waiting':
    default:
      return 'border-zinc-700';
  }
};

// Get background color based on status
const getBackgroundColor = (status: NodeStatus) => {
  switch (status) {
    case 'complete':
      return 'bg-green-500/5';
    case 'running':
      return 'bg-blue-500/5';
    case 'attention':
      return 'bg-yellow-500/5';
    case 'failed':
      return 'bg-red-500/5';
    case 'waiting':
    default:
      return 'bg-zinc-800/50';
  }
};

function PipelineNodeInner({ data }: NodeProps) {
  const nodeData = data as unknown as PipelineNodeData;
  const { id, shortName, status, summary, isSelected, onSelect } = nodeData;
  const StepIcon = getStepIcon(id);

  return (
    <>
      {/* Invisible handles for edge connections */}
      <Handle type="target" position={Position.Left} className="!opacity-0" />
      <Handle type="target" position={Position.Top} className="!opacity-0" />
      <Handle type="source" position={Position.Right} className="!opacity-0" />
      <Handle type="source" position={Position.Bottom} className="!opacity-0" />

      <div
        onClick={onSelect}
        className={cn(
          "w-[160px] h-[100px] rounded-xl border-2 p-3 transition-all cursor-pointer",
          "hover:shadow-lg hover:scale-[1.02]",
          getBorderColor(status, isSelected),
          getBackgroundColor(status),
          isSelected && "shadow-lg shadow-blue-500/20 ring-2 ring-blue-500/30"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-zinc-400">
            {id}. {shortName}
          </span>
          <StepIcon className="w-3.5 h-3.5 text-zinc-500" />
        </div>

        {/* Status Icon */}
        <div className="flex justify-center mb-2">
          {getStatusIcon(status)}
        </div>

        {/* Summary */}
        <p className={cn(
          "text-xs text-center truncate",
          status === 'complete' ? "text-green-400" :
          status === 'running' ? "text-blue-400" :
          status === 'attention' ? "text-yellow-400" :
          status === 'failed' ? "text-red-400" :
          "text-zinc-500"
        )}>
          {summary || (status === 'waiting' ? 'Waiting' : '')}
        </p>
      </div>
    </>
  );
}

export const PipelineNodeComponent = memo(PipelineNodeInner);
