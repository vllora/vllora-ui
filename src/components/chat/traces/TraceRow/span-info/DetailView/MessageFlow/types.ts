export interface FlowDialogProps {
  rawRequest: any | null;
  rawResponse: Record<string, any> | null;
  duration: any;
  costInfo: any
}

export type NodeType = 'user' | 'system' | 'tool' | 'tools' | 'model' | 'response' | 'tool_calls' | 'assistant';
