import React from 'react';
import { MessageStructure } from '@/utils/message-structure-from-span';
import { RunSpanMessage } from './run-wrapper';
import { TaskSpanMessage } from './task-wrapper';
import { RawSpanMessage } from './raw-span';

interface HierarchicalSpanItemProps {
  messageStructure: MessageStructure;
  level?: number;
  showRunIdHeader?: boolean;
  onRunIdClick?: (runId: string) => void;
}

/**
 * Renders a span with its messages and nested child spans in a hierarchical structure
 * Uses indentation to show nesting levels
 */
export const HierarchicalSpanItem: React.FC<HierarchicalSpanItemProps> = React.memo(({
  messageStructure,
  level = 0,
}) => {
  const { type, span_id, children } = messageStructure;  
  if(type === 'run') {
    return <RunSpanMessage runId={span_id} messages={children} level={level} />
  }

  if(type === 'task') {
    return <TaskSpanMessage spanId={span_id} messages={children} level={level} />
  }

  return <RawSpanMessage messageStructure={messageStructure} level={level} />;
});


