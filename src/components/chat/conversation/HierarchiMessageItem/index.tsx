import React from 'react';
import { MessageStructure } from '@/utils/message-structure-from-span';
import { RunWrapperMessage } from './run-wrapper';
import { TaskSpanMessage } from './task-wrapper';
import { RawSpanMessage } from './raw-span';
import { AgentSpanMessage } from './agent-wrapper';
import { VloraToolSpanMessage } from './tool-wrapper';
import { InvocationSpanMessage } from './invocation-wrapper';

interface HierarchicalSpanItemProps {
  messageStructure: MessageStructure;
  level?: number;
  showRunIdHeader?: boolean;
  onRunIdClick?: (runId: string) => void;
}

/**
 * Deep comparison for MessageStructure to detect structural changes
 */
export const compareMessageStructure = (
  prevStructure: MessageStructure,
  nextStructure: MessageStructure
): boolean => {
  // Compare basic properties
  if (
    prevStructure.span_id !== nextStructure.span_id ||
    prevStructure.type !== nextStructure.type ||
    prevStructure.run_id !== nextStructure.run_id
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
export const propsHierarchicalAreEqual = (prevProps: Readonly<HierarchicalSpanItemProps>, nextProps: Readonly<HierarchicalSpanItemProps>) => {
   // Re-render if level changes
    if (prevProps.level !== nextProps.level) return false;

    // Compare messageStructure deeply
    let isEqual = compareMessageStructure(prevProps.messageStructure, nextProps.messageStructure);
    return isEqual
}
/**
 * Renders a span with its messages and nested child spans in a hierarchical structure
 * Uses indentation to show nesting levels
 */
const HierarchicalMessageSpanItemComponent: React.FC<HierarchicalSpanItemProps> = ({
  messageStructure,
  level = 0,
}) => {
  const { type, span_id, run_id, children } = messageStructure;

  const renderContent = () => {
    if(type === 'agent') {
      return <AgentSpanMessage span_id={span_id} run_id={run_id} messages={children} level={level} />
    }
    if(type === 'run_wrapper') {
      return <RunWrapperMessage run_id={run_id} messages={children} level={level} />
    }
    if(type === 'run') {
      return <InvocationSpanMessage run_id={run_id} span_id={span_id} messages={children} level={level} />
    }

    if(type === 'task') {
      return <TaskSpanMessage run_id={run_id} span_id={span_id} messages={children} level={level} />
    }
    if(type === 'tools') {
      return <VloraToolSpanMessage span_id={span_id} />
    }

    return <RawSpanMessage messageStructure={messageStructure} level={level} />;
  };

  return (
    <div id={`hierachy-message-${span_id}`}>
      {renderContent()}
    </div>
  );
};

export const HierarchicalMessageSpanItem = React.memo(
  HierarchicalMessageSpanItemComponent,
  propsHierarchicalAreEqual
);




