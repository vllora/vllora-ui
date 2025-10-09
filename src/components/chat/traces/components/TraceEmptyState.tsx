import React from 'react';
import { Sparkles } from 'lucide-react';
import { CodeBlock } from './CodeBlock';
import { getBackendUrl } from '@/config/api';
import { ChatWindowConsumer } from '@/contexts/ChatWindowContext';

export const TraceEmptyState: React.FC = () => {
  const { projectId } = ChatWindowConsumer();
  const searchParam = new URLSearchParams(window.location.search);
  const threadId = searchParam.get('threadId') || 'YOUR_THREAD_ID';
  const model = searchParam.get('model') || 'openai/gpt-4o-mini'
 
  const sampleCurlCommand = `curl -X POST \\
  '${getBackendUrl()}/v1/chat/completions' \\
  -H 'x-project-id: ${projectId || 'YOUR_PROJECT_ID'}' \\
  -H 'x-thread-id: ${threadId}' \\
  -H 'content-type: application/json' \\
  -d '{
  "model": "${model}",
  "messages": [
    {
      "role": "user",
      "content": "Hello, how are you?"
    }
  ],
  "stream": true
}'`;

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8">
      <Sparkles className="h-12 w-12 text-muted-foreground/50 mb-4" />
      <p className="text-sm text-muted-foreground font-medium mb-2">No traces yet</p>
      <p className="text-xs text-muted-foreground mb-6">
        Send a message to start tracking requests, or try the sample curl command below
      </p>

      <div className="w-full max-w-2xl">
        <CodeBlock title="cUrl" code={sampleCurlCommand} language="bash" />
      </div>
    </div>
  );
};
