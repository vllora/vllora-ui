/**
 * LucyToolActions
 *
 * Clean tool approval card for external tools requiring user confirmation.
 * Shows a friendly description of what the tool will do, with collapsible
 * raw input for advanced users. Themed to match the app's visual style.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { CheckCircle2, XCircle, ChevronDown, ChevronRight, Play, Ban } from 'lucide-react';
import { createSuccessfulToolResult, createFailedToolResult, DistriFnTool, ToolCall, ToolResult } from '@distri/core';
import { ToolCallState } from '@distri/react';
import { cn } from '@/lib/utils';
import { getFriendlyToolMessage } from './lucy-message-utils';

/** Convert snake_case tool name to Title Case display name */
function formatToolName(name: string): string {
  return name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

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
  const [showInput, setShowInput] = useState(false);
  const autoExecute = tool.autoExecute;
  const toolName = toolCall.tool_name;
  const isLiveStream = toolCallState?.isLiveStream || false;
  const hasTriggeredRef = useRef(false);

  const friendlyMessage = getFriendlyToolMessage(toolName, toolCall.input);

  // Get/save approval preferences from localStorage
  const getApprovalPreferences = useCallback((): Record<string, boolean> => {
    try {
      const stored = localStorage.getItem('distri-tool-preferences');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  }, []);

  const saveApprovalPreference = useCallback(
    (name: string, approved: boolean) => {
      try {
        const preferences = getApprovalPreferences();
        preferences[name] = approved;
        localStorage.setItem('distri-tool-preferences', JSON.stringify(preferences));
      } catch { /* noop */ }
    },
    [getApprovalPreferences]
  );

  const handleExecute = useCallback(async () => {
    if (isProcessing || hasExecuted) return;
    if (!hasTriggeredRef.current) hasTriggeredRef.current = true;

    if (dontAskAgain) saveApprovalPreference(toolName, true);

    setIsProcessing(true);
    setHasExecuted(true);

    try {
      const result = await tool.handler(toolCall.input);
      if (!tool.is_final) {
        completeTool(createSuccessfulToolResult(toolCall.tool_call_id, toolName, result));
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      completeTool(createFailedToolResult(toolCall.tool_call_id, toolName, msg, 'Tool execution failed'));
    } finally {
      setIsProcessing(false);
    }
  }, [completeTool, dontAskAgain, hasExecuted, isProcessing, saveApprovalPreference, tool, toolCall, toolName]);

  const handleCancel = useCallback(() => {
    if (isProcessing || hasExecuted) return;
    if (!hasTriggeredRef.current) hasTriggeredRef.current = true;

    if (dontAskAgain) saveApprovalPreference(toolName, false);

    setHasExecuted(true);
    completeTool(
      createFailedToolResult(toolCall.tool_call_id, toolName, 'User cancelled the operation', 'Cancelled by user')
    );
  }, [completeTool, dontAskAgain, hasExecuted, isProcessing, saveApprovalPreference, toolCall, toolName]);

  // Auto-approval from stored preference
  useEffect(() => {
    if (!isLiveStream) return;
    const preferences = getApprovalPreferences();
    const autoApprove = preferences[toolName];
    if (autoApprove === undefined || hasExecuted || isProcessing || hasTriggeredRef.current) return;
    hasTriggeredRef.current = true;
    if (autoApprove) handleExecute();
    else handleCancel();
  }, [getApprovalPreferences, handleCancel, handleExecute, hasExecuted, isLiveStream, isProcessing, toolName]);

  // Auto-execute if tool is configured for it
  useEffect(() => {
    if (!isLiveStream) return;
    const preferences = getApprovalPreferences();
    const hasPreference = preferences[toolName] !== undefined;
    if (!autoExecute || hasPreference || hasExecuted || isProcessing || hasTriggeredRef.current) return;
    hasTriggeredRef.current = true;
    handleExecute();
  }, [autoExecute, getApprovalPreferences, handleExecute, hasExecuted, isLiveStream, isProcessing, toolName]);

  // --- Processing state (hidden — LucyToolCallCard already shows running indicator) ---
  if (isProcessing) {
    return null;
  }

  // --- Completed state ---
  if (hasExecuted) {
    const wasSuccessful = !toolCallState?.error;
    return (
      <div className={cn(
        'my-2 rounded-lg border px-3 py-2',
        wasSuccessful
          ? 'border-[rgba(var(--theme-500),0.2)] bg-[rgba(var(--theme-500),0.03)]'
          : 'border-destructive/30 bg-destructive/5'
      )}>
        <div className="flex items-center gap-2">
          {wasSuccessful ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-[rgb(var(--theme-500))] shrink-0" />
          ) : (
            <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
          )}
          <span className="text-xs text-foreground/70">
            {wasSuccessful ? 'Done' : 'Failed'}
          </span>
          <code className="text-[11px] text-muted-foreground font-mono">{formatToolName(toolName)}</code>
        </div>
      </div>
    );
  }

  // --- Pending state (needs approval) ---
  return (
    <div className="my-2 rounded-lg border border-border/60 bg-muted/30 overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2.5 flex items-center gap-2">
        <div className="w-6 h-6 rounded-md bg-[rgba(var(--theme-500),0.15)] flex items-center justify-center shrink-0">
          <Play className="w-3 h-3 text-[rgb(var(--theme-500))]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <code className="text-[11px] font-mono font-medium text-[rgb(var(--theme-400))]">{formatToolName(toolName)}</code>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{friendlyMessage}</p>
        </div>
      </div>

      {/* Collapsible input */}
      <div className="border-t border-border/40">
        <button
          onClick={() => setShowInput(!showInput)}
          className="w-full flex items-center gap-1.5 px-3 py-1.5 text-[11px] text-muted-foreground/70 hover:text-muted-foreground hover:bg-muted/30 transition-colors"
        >
          {showInput ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          <span>Input</span>
        </button>
        {showInput && (
          <div className="px-3 pb-2">
            <pre className="text-[11px] font-mono text-muted-foreground/80 bg-background/50 border border-border/40 rounded-md p-2 overflow-x-auto max-h-40">
              {JSON.stringify(toolCall.input, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* Actions */}
      {!autoExecute && (
        <div className="border-t border-border/40 px-3 py-2 flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 cursor-pointer flex-1 min-w-0">
            <Checkbox
              checked={dontAskAgain}
              onCheckedChange={(checked: boolean) => setDontAskAgain(checked)}
              className="w-3 h-3"
            />
            <span className="truncate">Remember for <span className="font-mono">{toolName}</span></span>
          </label>

          <div className="flex gap-1.5 shrink-0">
            <Button
              size="sm"
              variant="ghost"
              onClick={handleCancel}
              className="h-7 px-2.5 text-[11px] text-muted-foreground hover:text-destructive gap-1"
            >
              <Ban className="w-3 h-3" />
              Deny
            </Button>
            <Button
              size="sm"
              onClick={handleExecute}
              className="h-7 px-3 text-[11px] bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white gap-1"
            >
              <Play className="w-3 h-3" />
              Allow
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LucyToolActions;
