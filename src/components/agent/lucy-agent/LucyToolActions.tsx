/**
 * LucyToolActions
 *
 * Lucy-themed tool actions component for external tools requiring user approval.
 * Same logic as DefaultToolActions from @distri/react but with Lucy UI styling.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Wrench, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { createSuccessfulToolResult, createFailedToolResult, DistriFnTool, ToolCall, ToolResult } from '@distri/core';
import { ToolCallState } from '@distri/react';
import { cn } from '@/lib/utils';
import { JsonEditor } from '@/components/chat/conversation/model-config/json-editor';

export interface LucyToolActionsProps {
  toolCall: ToolCall;
  toolCallState?: ToolCallState;
  completeTool: (result: ToolResult) => void;
  tool: DistriFnTool;
  autoExecute?: boolean;
}

export const LucyToolActions: React.FC<LucyToolActionsProps> = ({
  toolCall,
  toolCallState,
  completeTool,
  tool,
}) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [hasExecuted, setHasExecuted] = useState(false);
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const [editedInput, setEditedInput] = useState(() => JSON.stringify(toolCall.input, null, 2));
  const [inputError, setInputError] = useState<string | null>(null);
  const autoExecute = tool.autoExecute;
  const toolName = toolCall.tool_name;
  const isLiveStream = toolCallState?.isLiveStream || false;
  const hasTriggeredRef = useRef(false);

  // Parse edited input, returning null if invalid JSON
  const getParsedInput = useCallback(() => {
    try {
      const parsed = JSON.parse(editedInput);
      setInputError(null);
      return parsed;
    } catch (e) {
      setInputError('Invalid JSON');
      return null;
    }
  }, [editedInput]);

  // Get approval preferences from localStorage
  const getApprovalPreferences = useCallback((): Record<string, boolean> => {
    try {
      const stored = localStorage.getItem('distri-tool-preferences');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  }, []);

  // Save approval preferences to localStorage
  const saveApprovalPreference = useCallback(
    (toolName: string, approved: boolean) => {
      try {
        const preferences = getApprovalPreferences();
        preferences[toolName] = approved;
        localStorage.setItem('distri-tool-preferences', JSON.stringify(preferences));
      } catch {
        // Silently fail if localStorage is unavailable
      }
    },
    [getApprovalPreferences]
  );

  const handleExecute = useCallback(async () => {
    if (isProcessing || hasExecuted) return;

    // Parse the edited input
    const parsedInput = getParsedInput();
    if (parsedInput === null) {
      return; // Don't execute if JSON is invalid
    }

    if (!hasTriggeredRef.current) {
      hasTriggeredRef.current = true;
    }

    // Save preference if "don't ask again" is checked
    if (dontAskAgain) {
      saveApprovalPreference(toolName, true);
    }

    setIsProcessing(true);
    setHasExecuted(true);

    try {
      // Execute the tool handler with edited input
      const result = await tool.handler(parsedInput);

      if (!tool.is_final) {
        const toolResult = createSuccessfulToolResult(toolCall.tool_call_id, toolName, result);
        completeTool(toolResult);
      } else {
        console.log('Tool is final, no action required');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const toolResult = createFailedToolResult(
        toolCall.tool_call_id,
        toolName,
        errorMessage,
        'Tool execution failed'
      );
      completeTool(toolResult);
    } finally {
      setIsProcessing(false);
    }
  }, [
    completeTool,
    dontAskAgain,
    getParsedInput,
    hasExecuted,
    isProcessing,
    saveApprovalPreference,
    tool,
    toolCall.tool_call_id,
    toolName,
  ]);

  const handleCancel = useCallback(() => {
    if (isProcessing || hasExecuted) return;
    if (!hasTriggeredRef.current) {
      hasTriggeredRef.current = true;
    }

    // Save preference if "don't ask again" is checked
    if (dontAskAgain) {
      saveApprovalPreference(toolName, false);
    }

    setHasExecuted(true);

    const toolResult = createFailedToolResult(
      toolCall.tool_call_id,
      toolName,
      'User cancelled the operation',
      'Tool execution cancelled by user'
    );

    completeTool(toolResult);
  }, [
    completeTool,
    dontAskAgain,
    hasExecuted,
    isProcessing,
    saveApprovalPreference,
    toolCall.tool_call_id,
    toolName,
  ]);

  // Check for auto-approval preference - but only for live stream tool calls
  useEffect(() => {
    if (!isLiveStream) return;

    const preferences = getApprovalPreferences();
    const autoApprove = preferences[toolName];

    if (autoApprove === undefined) return;
    if (hasExecuted || isProcessing) return;
    if (hasTriggeredRef.current) return;

    hasTriggeredRef.current = true;

    if (autoApprove) {
      handleExecute();
    } else {
      handleCancel();
    }
  }, [getApprovalPreferences, handleCancel, handleExecute, hasExecuted, isLiveStream, isProcessing, toolName]);

  // Auto-execute if enabled - but only for live stream tool calls and if no user preference exists
  useEffect(() => {
    if (!isLiveStream) return;

    const preferences = getApprovalPreferences();
    const hasPreference = preferences[toolName] !== undefined;

    if (!autoExecute || hasPreference || hasExecuted || isProcessing) {
      return;
    }
    if (hasTriggeredRef.current) return;

    hasTriggeredRef.current = true;
    handleExecute();
  }, [autoExecute, getApprovalPreferences, handleExecute, hasExecuted, isLiveStream, isProcessing, toolName]);

  // Processing state - show spinner
  if (isProcessing) {
    return (
      <div className="border-l-2 border-[rgb(var(--theme-500))] pl-3 py-1.5">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 text-[rgb(var(--theme-500))] animate-spin shrink-0" />
          <div>
            <span className="text-xs font-medium">Executing...</span>
            <code className="text-xs text-muted-foreground font-mono ml-1.5">{toolName}</code>
          </div>
        </div>
      </div>
    );
  }

  // Completed state
  if (hasExecuted) {
    const wasSuccessful = !toolCallState?.error;
    return (
      <div
        className={cn(
          'border-l pl-3 py-1.5',
          wasSuccessful
            ? 'border-[rgb(var(--theme-500))]'
            : 'border-destructive'
        )}
      >
        <div className="flex items-center gap-2">
          {wasSuccessful ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-[rgb(var(--theme-500))] shrink-0" />
          ) : (
            <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
          )}
          <span className="text-xs font-medium">
            {wasSuccessful ? 'Completed' : 'Failed'}
          </span>
          <code className="text-xs text-muted-foreground font-mono">{toolName}</code>
        </div>

        {toolCallState?.result && (
          <div className="mt-1.5">
            <div className="text-[11px] font-medium text-muted-foreground mb-0.5">Result</div>
            <pre className="text-xs bg-zinc-900/50 p-2 rounded-md border border-border/50 overflow-x-auto max-h-32">
              {typeof toolCallState.result === 'string'
                ? toolCallState.result
                : JSON.stringify(toolCallState.result, null, 2)}
            </pre>
          </div>
        )}

        {toolCallState?.error && (
          <div className="mt-1.5">
            <div className="text-[11px] font-medium text-destructive mb-0.5">Error</div>
            <div className="text-xs text-destructive">
              {toolCallState.error}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Pending state with action buttons
  return (
    <div className="border-l-2 border-[rgb(var(--theme-500))] pl-3 py-2">
      <div className="flex items-center gap-2 mb-3">
        <Wrench className="h-4 w-4 text-[rgb(var(--theme-500))] shrink-0" />
        <div>
          <span className="text-xs font-medium">Action Required</span>
          <code className="text-xs text-muted-foreground font-mono ml-1.5">{toolName}</code>
        </div>
      </div>

      {/* Editable input with JsonEditor */}
      <div className="mb-3">
        <div className="text-[11px] font-medium text-muted-foreground mb-1">Input</div>
        <div className="rounded-md border border-border/50 overflow-hidden h-[150px]">
          <JsonEditor
            value={editedInput}
            onChange={(value) => {
              setEditedInput(value);
              setInputError(null);
            }}
            hideValidation
          />
        </div>
        {inputError && (
          <div className="text-xs text-red-500 mt-1">{inputError}</div>
        )}
      </div>

      {!autoExecute && (
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="lucy-dont-ask-again"
              checked={dontAskAgain}
              onCheckedChange={(checked: boolean) => setDontAskAgain(checked)}
            />
            <label
              htmlFor="lucy-dont-ask-again"
              className="text-xs text-muted-foreground cursor-pointer"
            >
              Remember my choice for <span className="font-mono">{toolName}</span>
            </label>
          </div>

          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleCancel}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleExecute}
              className="flex-1 bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white"
            >
              Confirm
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LucyToolActions;
