import { McpServerConfig } from '@/services/mcp-api';
import mitt, { Emitter } from 'mitt';

type Events = {
  langdb_input_fileAdded: { files: any[] };
  langdb_input_chatSubmit: {
    inputText: string;
    files: any[];
    searchToolEnabled?: boolean;
    otherTools?: string[];
    toolsUsage?: Map<string, McpServerConfig>;
  };
  langdb_chatTerminate: { threadId: string; widgetId?: string };
  langdb_clearChat: { threadId?: string; widgetId?: string };
  langdb_chat_scrollToBottom: { threadId?: string; widgetId?: string };
  langdb_refreshMessage: { threadId: string };
  langdb_newMessageAdded: { threadId?: string; messageId?: string };
  langdb_usageStats: { usage: any; threadId?: string; widgetId?: string };
  langdb_chatWindow: {
    widgetId: string;
    state: string;
    threadId?: string;
    messageId?: string;
    traceId?: string;
    runId?: string;
    error?: string;
  };
  langdb_input_speechRecognitionStart: Record<string, never>;
  langdb_input_speechRecognitionEnd: Record<string, never>;
};

export const emitter: Emitter<Events> = mitt<Events>();