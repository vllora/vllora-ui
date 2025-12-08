export interface FlowDialogProps {
  rawRequest: any | null;
  rawResponse: Record<string, any> | null;
  duration: any;
  costInfo: any;
  headers?: Record<string, any> | null;
  operation_name?: string
}

export type NodeType = 'user' | 'system' | 'tool' | 'tools' | 'model' | 'response' | 'tool_calls' | 'assistant';
