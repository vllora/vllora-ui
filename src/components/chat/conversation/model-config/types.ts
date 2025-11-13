// Message types for Model Configuration

export type MessageRole = 'system' | 'user' | 'assistant';

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
}

export interface Variable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
}

// Helper function to generate unique message IDs
export const generateMessageId = (): string => {
  return `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// Default message template
export const DEFAULT_MESSAGE_CONTENT = "You are a helpful assistant.";
