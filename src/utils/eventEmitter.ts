import { McpServerConfig } from '@/services/mcp-api';
import mitt, { Emitter } from 'mitt';

type Events = {
  vllora_input_fileAdded: { files: any[] };
  vllora_input_chatSubmit: {
    inputText: string;
    files: any[];
    searchToolEnabled?: boolean;
    otherTools?: string[];
    toolsUsage?: Map<string, McpServerConfig>;
  };
  vllora_chatTerminate: { threadId: string; widgetId?: string };
  vllora_clearChat: { threadId?: string; widgetId?: string };
  vllora_chat_scrollToBottom: { threadId?: string; widgetId?: string };
  vllora_usageStats: { usage: any; threadId?: string; widgetId?: string };
  vllora_chatWindow: {
    widgetId: string;
    state: string;
    threadId?: string;
    messageId?: string;
    traceId?: string;
    runId?: string;
    error?: string;
  };
  vllora_input_speechRecognitionStart: Record<string, never>;
  vllora_input_speechRecognitionEnd: Record<string, never>;
};

export const emitter: Emitter<Events> = mitt<Events>();