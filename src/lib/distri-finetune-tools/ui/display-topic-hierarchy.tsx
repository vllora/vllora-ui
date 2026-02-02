/**
 * DisplayTopicHierarchy - UI Tool for displaying a topic hierarchy tree
 *
 * This tool allows the agent to display a suggested topic hierarchy
 * in a visual tree format before asking the user to accept/modify it.
 */

import React, { useState, useCallback, useEffect } from 'react';
import type { DistriBaseTool, ToolCall, ToolResult } from '@distri/core';
import { cn } from '@/lib/utils';
import { ChevronRight, ChevronDown, FolderTree, Folder, FileText } from 'lucide-react';

// ============================================================================
// Types
// ============================================================================

export interface TopicNode {
  name: string;
  description?: string;
  children?: TopicNode[];
}

export interface DisplayTopicHierarchyInput {
  title?: string;
  description?: string;
  hierarchy: TopicNode[];
  /** If true, auto-complete after rendering (no user action needed) */
  autoComplete?: boolean;
}

export interface DisplayTopicHierarchyOutput {
  displayed: boolean;
  hierarchy: TopicNode[];
}

// Tool props type (matching UiToolProps from @distri/react)
interface UiToolProps {
  toolCall: ToolCall;
  toolCallState?: { status: string };
  completeTool: (result: ToolResult) => void;
  tool: DistriBaseTool;
}

// DistriUiTool interface
interface DistriUiTool extends DistriBaseTool {
  type: 'ui';
  component: (props: UiToolProps) => React.ReactNode;
}

// ============================================================================
// Tool Definition
// ============================================================================

export const DISPLAY_TOPIC_HIERARCHY_TOOL_NAME = 'display_topic_hierarchy';

export function createDisplayTopicHierarchyTool(): DistriUiTool {
  return {
    type: 'ui',
    name: DISPLAY_TOPIC_HIERARCHY_TOOL_NAME,
    description:
      'Display a topic hierarchy to the user in a visual tree format. Use this to show suggested topic structures before asking the user to accept or modify them.',
    isExternal: false,
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Optional title for the hierarchy display',
        },
        description: {
          type: 'string',
          description: 'Optional description explaining the hierarchy',
        },
        hierarchy: {
          type: 'array',
          description: 'The topic hierarchy to display',
          items: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Topic name',
              },
              description: {
                type: 'string',
                description: 'Optional topic description',
              },
              children: {
                type: 'array',
                description: 'Child topics',
              },
            },
            required: ['name'],
          },
        },
        autoComplete: {
          type: 'boolean',
          description:
            'If true, automatically complete after rendering. Default is true.',
        },
      },
      required: ['hierarchy'],
    },
    component: DisplayTopicHierarchyComponent,
  };
}

// ============================================================================
// Tree Node Component
// ============================================================================

interface TreeNodeProps {
  node: TopicNode;
  level: number;
  defaultExpanded?: boolean;
}

function TreeNode({ node, level, defaultExpanded = true }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const hasChildren = node.children && node.children.length > 0;

  const toggleExpand = useCallback(() => {
    if (hasChildren) {
      setExpanded((prev) => !prev);
    }
  }, [hasChildren]);

  return (
    <div className="select-none">
      <div
        className={cn(
          'flex items-center gap-1.5 py-1 px-2 rounded-md cursor-pointer transition-colors',
          'hover:bg-muted/50',
          level === 0 && 'font-medium'
        )}
        style={{ paddingLeft: `${level * 16 + 8}px` }}
        onClick={toggleExpand}
      >
        {/* Expand/collapse icon */}
        {hasChildren ? (
          expanded ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          )
        ) : (
          <span className="w-4 h-4 flex-shrink-0" />
        )}

        {/* Node icon */}
        {hasChildren ? (
          <Folder className="w-4 h-4 text-primary flex-shrink-0" />
        ) : (
          <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        )}

        {/* Node name */}
        <span className="text-sm">{node.name}</span>

        {/* Description badge */}
        {node.description && (
          <span className="text-xs text-muted-foreground ml-2 truncate max-w-[200px]">
            {node.description}
          </span>
        )}
      </div>

      {/* Children */}
      {hasChildren && expanded && (
        <div>
          {node.children!.map((child, index) => (
            <TreeNode
              key={`${child.name}-${index}`}
              node={child}
              level={level + 1}
              defaultExpanded={level < 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

function DisplayTopicHierarchyComponent({
  toolCall,
  toolCallState,
  completeTool,
}: UiToolProps): React.ReactNode {
  const input = toolCall.input as DisplayTopicHierarchyInput;
  const hierarchy = input?.hierarchy || [];
  const autoComplete = input?.autoComplete !== false; // Default to true
  const isCompleted = toolCallState?.status === 'completed';

  // Count total topics
  const countTopics = useCallback((nodes: TopicNode[]): number => {
    return nodes.reduce((count, node) => {
      return count + 1 + (node.children ? countTopics(node.children) : 0);
    }, 0);
  }, []);

  const totalTopics = countTopics(hierarchy);

  // Auto-complete after rendering
  useEffect(() => {
    if (autoComplete && !isCompleted && hierarchy.length > 0) {
      // Small delay to ensure the UI is rendered
      const timer = setTimeout(() => {
        const output: DisplayTopicHierarchyOutput = {
          displayed: true,
          hierarchy,
        };
        completeTool({
          tool_call_id: toolCall.tool_call_id,
          tool_name: toolCall.tool_name,
          parts: [
            {
              part_type: 'data',
              data: output,
            },
          ],
        });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [autoComplete, isCompleted, hierarchy, completeTool, toolCall]);

  // Empty hierarchy
  if (hierarchy.length === 0) {
    return (
      <div className="border rounded-lg p-4 bg-muted/30">
        <p className="text-sm text-muted-foreground">No hierarchy to display</p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg overflow-hidden bg-card shadow-sm">
      {/* Header */}
      <div className="px-4 py-3 border-b bg-muted/30 flex items-center gap-2">
        <FolderTree className="w-4 h-4 text-primary" />
        <div className="flex-1">
          <h3 className="font-medium text-sm">
            {input.title || 'Suggested Topic Hierarchy'}
          </h3>
          {input.description && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {input.description}
            </p>
          )}
        </div>
        <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
          {totalTopics} topic{totalTopics !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Tree */}
      <div className="p-2 max-h-[400px] overflow-y-auto">
        {hierarchy.map((node, index) => (
          <TreeNode
            key={`${node.name}-${index}`}
            node={node}
            level={0}
            defaultExpanded={true}
          />
        ))}
      </div>
    </div>
  );
}

export default createDisplayTopicHierarchyTool;
