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
      <div className="flex flex-col items-center mb-8">
        <div className="h-16 w-16 rounded-full bg-muted/30 flex items-center justify-center mb-4">
          <Sparkles className="h-8 w-8 text-muted-foreground/60" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">No traces yet</h3>
        <p className="text-sm text-muted-foreground text-center max-w-md">
          Start tracking your API requests by sending a message or try the sample command below
        </p>
      </div>

      <div className="w-full max-w-3xl">
        <div className="mb-3 flex items-center gap-2">
          <div className="h-px flex-1 bg-border"></div>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Get Started</span>
          <div className="h-px flex-1 bg-border"></div>
        </div>
        <CodeBlock title="Sample cURL Request" code={sampleCurlCommand} language="bash" />
      </div>
    </div>
  );
};
