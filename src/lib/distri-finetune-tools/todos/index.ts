/**
 * Todos Tool
 *
 * External implementation of write_todos that runs in the browser.
 * Emits window events for UI updates.
 */

import type { DistriFnTool, TodoItem, TodoStatus } from '@distri/core';

// Re-export types from @distri/core for convenience
export type { TodoItem, TodoStatus };

// =============================================================================
// Types
// =============================================================================

export interface WriteTodosInput {
  content: string;
  status?: TodoStatus;
}

export interface WriteTodosParams {
  todos: WriteTodosInput[];
}

export interface WriteTodosResult {
  success: boolean;
  todo_count: number;
  message: string;
}

// =============================================================================
// Event Emitter
// =============================================================================

/**
 * Emit a todos updated event for UI components to listen to
 */
export function emitTodosUpdate(todos: TodoItem[]): void {
  if (typeof window !== 'undefined') {
    console.log('[write_todos] Emitting lucy-todos-updated event:', todos);
    window.dispatchEvent(
      new CustomEvent('lucy-todos-updated', {
        detail: { todos },
      })
    );
  }
}

// =============================================================================
// Tool Handler
// =============================================================================

// Generate a simple unique ID
function generateId(): string {
  return `todo-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export async function writeTodosHandler(
  params: WriteTodosParams
): Promise<WriteTodosResult> {
  console.log('[write_todos] Handler called with params:', params);
  const { todos = [] } = params;

  // Validate and transform todos to include IDs
  const validTodos: TodoItem[] = todos
    .filter(
      (t) =>
        typeof t.content === 'string' &&
        t.content.trim() !== '' &&
        (!t.status || ['open', 'in_progress', 'done'].includes(t.status))
    )
    .map((t) => ({
      id: generateId(),
      content: t.content,
      status: t.status || 'open',
    }));

  // Emit event for UI update
  emitTodosUpdate(validTodos);

  return {
    success: true,
    todo_count: validTodos.length,
    message:
      validTodos.length === 0
        ? 'Todos cleared'
        : `Updated ${validTodos.length} todo(s)`,
  };
}

// =============================================================================
// Tool Definition
// =============================================================================

export const writeTodosTool: DistriFnTool = {
  name: 'write_todos',
  type: 'function',
  autoExecute: true, // Auto-execute without user confirmation
  description:
    'Manage TODOs with efficient bulk operations. Use write_todos for all modifications. Always keep and recite current TODOs in context.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    properties: {
      todos: {
        type: 'array',
        description: 'Replace the current TODO list with these entries.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            content: {
              type: 'string',
              description: 'Short description of the TODO item.',
            },
            status: {
              type: 'string',
              enum: ['open', 'in_progress', 'done'],
              description: "Optional status override. Defaults to 'open'.",
            },
          },
          required: ['content'],
        },
      },
    },
    required: ['todos'],
  },
  handler: (params) => writeTodosHandler(params as WriteTodosParams),
};

// =============================================================================
// Exports
// =============================================================================

export const todosTools: DistriFnTool[] = [writeTodosTool];

export const todosToolHandlers: Record<
  string,
  (params: Record<string, unknown>) => Promise<unknown>
> = {
  write_todos: (params: Record<string, unknown>) =>
    writeTodosHandler(params as unknown as WriteTodosParams),
};

export const TODOS_TOOL_NAMES = ['write_todos'] as const;
export type TodosToolName = (typeof TODOS_TOOL_NAMES)[number];

export function isTodosTool(toolName: string): toolName is TodosToolName {
  return TODOS_TOOL_NAMES.includes(toolName as TodosToolName);
}
