import React from 'react';
import { MessageStructure } from '@/utils/message-structure-from-span';
import { RunSpanMessage } from './run-wrapper';
import { TaskSpanMessage } from './task-wrapper';
import { RawSpanMessage } from './raw-span';
import { AgentSpanMessage } from './agent-wrapper';
import { ToolSpanMessage } from './tool-wrapper';

interface HierarchicalSpanItemProps {
  messageStructure: MessageStructure;
  level?: number;
  showRunIdHeader?: boolean;
  onRunIdClick?: (runId: string) => void;
}

/**
 * Deep comparison for MessageStructure to detect structural changes
 */
const compareMessageStructure = (
  prevStructure: MessageStructure,
  nextStructure: MessageStructure
): boolean => {
  // Compare basic properties
  if (
    prevStructure.span_id !== nextStructure.span_id ||
    prevStructure.type !== nextStructure.type
  ) {
    return false;
  }

  // Compare children array length
  if (prevStructure.children.length !== nextStructure.children.length) {
    return false;
  }

  // Recursively compare each child
  for (let i = 0; i < prevStructure.children.length; i++) {
    if (!compareMessageStructure(prevStructure.children[i], nextStructure.children[i])) {
      return false;
    }
  }

  return true;
};

/**
 * Renders a span with its messages and nested child spans in a hierarchical structure
 * Uses indentation to show nesting levels
 */
const HierarchicalMessageSpanItemComponent: React.FC<HierarchicalSpanItemProps> = ({
  messageStructure,
  level = 0,
}) => {
  const { type, span_id, children } = messageStructure;
  if(type === 'agent') {
    return <AgentSpanMessage spanId={span_id} messages={children} level={level} />
  }
  if(type === 'run') {
    return <RunSpanMessage runId={span_id} messages={children} level={level} />
  }

  if(type === 'task') {
    return <TaskSpanMessage spanId={span_id} messages={children} level={level} />
  }
  if(type === 'tools') {
    return <ToolSpanMessage spanId={span_id} messages={children} level={level} />
  }

  return <RawSpanMessage messageStructure={messageStructure} level={level} />;
};

export const HierarchicalMessageSpanItem = React.memo(
  HierarchicalMessageSpanItemComponent,
  (prevProps, nextProps) => {
    // Re-render if level changes
    if (prevProps.level !== nextProps.level) return false;

    // Compare messageStructure deeply
    return compareMessageStructure(prevProps.messageStructure, nextProps.messageStructure);
  }
);


