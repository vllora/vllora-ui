export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

export interface Thread {
  id: string;
  title: string;
  model: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

export interface CreateThreadRequest {
  model: string;
  title?: string;
}

export interface SendMessageRequest {
  threadId: string;
  content: string;
}