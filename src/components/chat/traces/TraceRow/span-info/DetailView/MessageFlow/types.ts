export interface FlowDialogProps {
  rawRequest: Record<string, any> | null;
  rawResponse: Record<string, any> | null;
}

export type NodeType = 'user' | 'system' | 'tool' | 'tools' | 'model' | 'response' | 'tool_calls' | 'assistant';
