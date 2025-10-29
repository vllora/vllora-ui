import React from 'react';
import { Button } from '@/components/ui/button';
import { CodeBlock } from '@/components/chat/traces/components/CodeBlock';
import { getBackendUrl } from '@/config/api';

interface ChatEmptyStateProps {
  onNewChat: () => void;
}

export const ChatEmptyState: React.FC<ChatEmptyStateProps> = ({ onNewChat }) => {
  const searchParam = new URLSearchParams(window.location.search);
  const projectIdFromUrl = searchParam.get('project_id');
  const threadIdFromUrl = searchParam.get('threadId');
  const model = searchParam.get('model') || 'openai/gpt-4o-mini';

  // Only include x-project-id if project_id exists
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
    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-gradient-to-b from-background to-background/95">
      <div className="flex flex-col items-center gap-8 max-w-3xl w-full animate-in fade-in slide-in-from-bottom-2 duration-500">
        {/* Hero Section */}
        <div className="flex flex-col items-center gap-6">
          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-foreground">
                Welcome to
              </h1>
              <img
                src="/logo-dark.svg"
                alt="Vllora"
                className="h-12 w-auto transition-transform hover:scale-105"
              />
            </div>
            <p className="text-base text-muted-foreground/90 text-center max-w-xl leading-relaxed">
              Start conversations with AI models, track your usage, and explore traces—all in one place
            </p>
          </div>

          <Button
            onClick={onNewChat}
            size="lg"
            className="mt-2 bg-gradient-to-r from-[rgb(var(--theme-600))] to-[rgb(var(--theme-500))] hover:from-[rgb(var(--theme-700))] hover:to-[rgb(var(--theme-600))] text-white font-semibold shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-200 px-8 py-6 text-base"
          >
            Start Your First Chat
          </Button>
        </div>

        {/* API Sample Section */}
        <div className="w-full mt-8">
          <div className="flex items-center gap-4 mb-6">
            <div className="flex-1 h-px bg-border"></div>
            <span className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
              Or try the API
            </span>
            <div className="flex-1 h-px bg-border"></div>
          </div>
          <CodeBlock title="Sample cURL Request" code={sampleCurlCommand} language="bash" />
        </div>
      </div>
    </div>
  );
};
