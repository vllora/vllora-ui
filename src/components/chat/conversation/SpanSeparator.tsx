import React from 'react';
import { Play, BotIcon, ChevronDown, ChevronRight } from 'lucide-react';

type SeparatorType = 'task' | 'run' | 'agent' | 'tool';

interface SpanSeparatorProps {
  type: SeparatorType;
  spanId: string;
  onClick?: (spanId: string) => void;
  isCollapsed?: boolean;
  onToggle?: () => void;
  level?: number;
}

/**
 * Unified visual separator component for Task, Run, and Agent spans
 * Shows span ID with lines on both sides and collapsible functionality
 */
export const SpanSeparator: React.FC<SpanSeparatorProps> = ({
  type,
  spanId,
  onClick,
  isCollapsed = false,
  onToggle,
  level = 0
}) => {
  const handleClick = () => {
    if (onToggle) {
      onToggle();
    } else if (onClick) {
      onClick(spanId);
    }
  };

  // Configure appearance based on type
  const config = {
    task: {
      icon: Play,
      label: `Task Start: ${spanId.slice(0, 8)}`,
      color: 'border-blue-500/40',
    },
    run: {
      icon: Play,
      label: `Run Start: ${spanId.slice(0, 8)}`,
      color: 'border-purple-500/40',
    },
    agent: {
      icon: BotIcon,
      label: `Agent Start: ${spanId.slice(0, 8)}`,
      color: 'border-green-500/40',
    },
    tool: {
      icon: BotIcon,
      label: `Tool Start: ${spanId.slice(0, 8)}`,
      color: 'border-yellow-500/40',
    },
  };

  const { icon: Icon, label, color } = config[type];

  // Consistent left-aligned design for all levels
  return (
    <div className={`flex items-center gap-2 ${level === 0 ? 'my-6' : 'my-4'}`}>
      {/* Separator badge with colored left border */}
      <button
        onClick={handleClick}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-md bg-muted/30 border-l-2 ${color} hover:bg-muted/50 transition-colors cursor-pointer group`}
        title={`Click to ${isCollapsed ? 'expand' : 'collapse'} ${type}: ${spanId}`}
      >
        {onToggle && (
          isCollapsed ? (
            <ChevronRight className="w-3 h-3 text-muted-foreground/70 group-hover:text-muted-foreground transition-colors" />
          ) : (
            <ChevronDown className="w-3 h-3 text-muted-foreground/70 group-hover:text-muted-foreground transition-colors" />
          )
        )}
        <Icon className="w-3 h-3 text-muted-foreground/70 group-hover:text-muted-foreground transition-colors" />
        <span className="text-[11px] font-mono font-medium text-muted-foreground/90 group-hover:text-foreground tracking-wide transition-colors">
          {label}
        </span>
      </button>
    </div>
  );
};

// Convenience wrappers for backwards compatibility
export const TaskStartSeparator: React.FC<{
  spanId: string;
  onClick?: (spanId: string) => void;
  isCollapsed?: boolean;
  onToggle?: () => void;
  level?: number;
}> = (props) => <SpanSeparator type="task" {...props} />;

export const RunStartSeparator: React.FC<{
  runId: string;
  onClick?: (runId: string) => void;
  isCollapsed?: boolean;
  onToggle?: () => void;
  level?: number;
}> = ({ runId, ...props }) => <SpanSeparator type="run" spanId={runId} {...props} />;

export const AgentStartSeparator: React.FC<{
  spanId: string;
  onClick?: (spanId: string) => void;
  isCollapsed?: boolean;
  onToggle?: () => void;
  level?: number;
}> = (props) => <SpanSeparator type="agent" {...props} />;

export const ToolStartSeparator: React.FC<{
  spanId: string;
  onClick?: (spanId: string) => void;
  isCollapsed?: boolean;
  onToggle?: () => void;
  level?: number;
}> = (props) => <SpanSeparator type="tool" {...props} />;
  