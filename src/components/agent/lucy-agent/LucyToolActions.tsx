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
      <div className="border border-border rounded-xl p-4 bg-muted/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <Loader2 className="h-5 w-5 text-blue-600 dark:text-blue-400 animate-spin" />
          </div>
          <div>
            <div className="text-sm font-medium">Executing...</div>
            <code className="text-xs text-muted-foreground font-mono">{toolName}</code>
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
          'border rounded-xl p-4',
          wasSuccessful
            ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10'
            : 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10'
        )}
      >
        <div className="flex items-center gap-3 mb-3">
          <div
            className={cn(
              'w-10 h-10 rounded-full flex items-center justify-center',
              wasSuccessful ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-red-100 dark:bg-red-900/30'
            )}
          >
            {wasSuccessful ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
            )}
          </div>
          <div>
            <div className="text-sm font-medium">
              {wasSuccessful ? 'Completed' : 'Failed'}
            </div>
            <code className="text-xs text-muted-foreground font-mono">{toolName}</code>
          </div>
        </div>

        {toolCallState?.result && (
          <div className="mt-3">
            <div className="text-xs font-medium text-muted-foreground mb-1">Result</div>
            <pre className="text-xs bg-background/80 p-2 rounded-lg border overflow-x-auto max-h-32">
              {typeof toolCallState.result === 'string'
                ? toolCallState.result
                : JSON.stringify(toolCallState.result, null, 2)}
            </pre>
          </div>
        )}

        {toolCallState?.error && (
          <div className="mt-3">
            <div className="text-xs font-medium text-red-600 dark:text-red-400 mb-1">Error</div>
            <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-2 rounded-lg border border-red-200 dark:border-red-800">
              {toolCallState.error}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Pending state with action buttons
  return (
    <div className="border border-[rgb(var(--theme-200))] dark:border-[rgb(var(--theme-800))] rounded-xl p-4 bg-[rgb(var(--theme-50))]/50 dark:bg-[rgb(var(--theme-900))]/10">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-[rgb(var(--theme-100))] dark:bg-[rgb(var(--theme-900))]/30 flex items-center justify-center">
          <Wrench className="h-5 w-5 text-[rgb(var(--theme-600))] dark:text-[rgb(var(--theme-400))]" />
        </div>
        <div>
          <div className="text-sm font-medium">Action Required</div>
          <code className="text-xs text-muted-foreground font-mono">{toolName}</code>
        </div>
      </div>

      {/* Editable input with JsonEditor */}
      <div className="mb-4">
        <div className="text-xs font-medium text-muted-foreground mb-1">Input</div>
        <div className="rounded-lg border overflow-hidden h-[150px]">
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
