/**
 * EmptyDatasetsState
 *
 * Empty state component displayed when no datasets exist.
 * Shows a simple curl command to get started with the LLM Gateway.
 */

import { Radio } from "lucide-react";
import { CodeBlock } from "@/components/chat/traces/components/CodeBlock";

const CURL_COMMAND = `curl http://localhost:9090/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o-mini",
    "messages": [
      {"role": "system", "content": "You are a friendly chess tutor."},
      {"role": "user", "content": "FEN: rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1\\n\\nWhat are the best responses for black?"}
    ]
  }'`;

export function EmptyDatasetsState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 relative overflow-hidden">
      {/* Subtle background glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-[rgba(var(--theme-500),0.03)] rounded-full blur-3xl" />
      </div>

      {/* Main content */}
      <div className="flex flex-col items-center max-w-xl text-center relative z-10">
        {/* Status indicator */}
        <div className="mb-8">
          <div className="relative inline-flex items-center justify-center">
            {/* Outer rotating ring */}
            <div className="absolute h-24 w-24 rounded-full border border-border/50 border-t-[rgba(var(--theme-500),0.4)] animate-spin [animation-duration:8s]" />
            {/* Pulsing ring */}
            <div className="absolute h-24 w-24 rounded-full border border-[rgba(var(--theme-500),0.15)] animate-ping [animation-duration:3s]" />
            {/* Middle counter-rotating ring */}
            <div className="absolute h-20 w-20 rounded-full border border-border/60 border-b-[rgba(var(--theme-500),0.3)] animate-spin [animation-duration:6s] [animation-direction:reverse]" />
            {/* Inner pulsing circle */}
            <div className="h-14 w-14 rounded-full bg-gradient-to-br from-[rgba(var(--theme-400),0.2)] to-[rgba(var(--theme-600),0.2)] border border-[rgba(var(--theme-500),0.3)] flex items-center justify-center backdrop-blur-sm animate-pulse [animation-duration:2s]">
              <Radio className="h-6 w-6 text-[rgb(var(--theme-500))]" />
            </div>
          </div>
        </div>

        {/* Title */}
        <h1 className="text-3xl font-semibold mb-3 text-foreground">
          Waiting for traces
        </h1>
        <p className="text-muted-foreground mb-6">
          Copy and run this command in your terminal
        </p>

        {/* Curl command box */}
        <div className="w-full">
          <CodeBlock
            title="Terminal"
            code={CURL_COMMAND}
            language="bash"
          />
        </div>
      </div>
    </div>
  );
}
