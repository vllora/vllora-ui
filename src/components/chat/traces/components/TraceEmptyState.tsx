import React from 'react';
import { Sparkles } from 'lucide-react';
import { CodeBlock } from './CodeBlock';
import { getBackendUrl } from '@/config/api';

interface TraceEmptyStateProps {
  projectId?: string;
}

export const TraceEmptyState: React.FC<TraceEmptyStateProps> = ({ projectId }) => {
  const searchParam = new URLSearchParams(window.location.search);
  const projectIdFromUrl = searchParam.get('project_id') ?? projectId;
  const threadIdFromUrl = searchParam.get('thread_id');
  const model = searchParam.get('model') || 'openai/gpt-4o-mini';

  // Only include x-project-id if projectId exists
  const projectIdHeader = projectIdFromUrl
    ? `  -H 'x-project-id: ${projectIdFromUrl}' \\\n`
    : '';

  // Only include x-thread-id if threadId exists in URL
  const threadIdHeader = threadIdFromUrl
    ? `  -H 'x-thread-id: ${threadIdFromUrl}' \\\n`
    : '';

  const sampleCurlCommand = `curl -X POST \\
  '${getBackendUrl()}/v1/chat/completions' \\
${projectIdHeader}${threadIdHeader}  -H 'content-type: application/json' \\
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
    <div className="flex-1 flex flex-col items-center justify-center p-8 gap-6">
      <div className="flex flex-col items-center gap-3">
        <div className="h-12 w-12 rounded-full bg-muted/20 flex items-center justify-center">
          <Sparkles className="h-6 w-6 text-muted-foreground/50" />
        </div>
        <div className="flex flex-col items-center gap-1">
          <h3 className="text-base font-medium text-foreground">No traces yet</h3>
          <p className="text-xs text-muted-foreground/80 text-center max-w-sm">
            Start tracking your API requests by sending a message or try the sample command below
          </p>
        </div>
      </div>

      <div className="w-full max-w-2xl">
        <CodeBlock title="Sample cURL Request" code={sampleCurlCommand} language="bash" />
      </div>
    </div>
  );
};
