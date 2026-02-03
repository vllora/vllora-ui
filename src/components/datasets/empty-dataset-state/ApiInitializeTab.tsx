/**
 * ApiInitializeTab
 *
 * Tab content for initializing dataset via API.
 * Features curl command on left, live trace feed on right.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Copy, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CodeBlock } from "@/components/chat/traces/components/CodeBlock";
import { LiveTraceFeed, type Trace } from "./LiveTraceFeed";

const SYSTEM_PROMPT = `You are an expert chess tutor helping a student improve their chess skills. Your role is to:

1. ANALYZE positions using the analyze_position tool
2. EVALUATE the student's moves when they make moves
3. EXPLAIN positions in a way appropriate for the student's level
4. SUGGEST candidate moves for the student to consider
5. ENGAGE with questions and conversation about chess

## CRITICAL REQUIREMENTS

### Teaching Style
- Adapt explanations to the student's level (beginner/intermediate/advanced)
- Focus on key strategic and tactical ideas
- Explain WHY moves are good or bad
- Be encouraging but honest about mistakes
- Ask questions to encourage active thinking

### TWO MODES

**MOVE MODE**: When the user makes a valid chess move
- The move has ALREADY been applied to the board
- Analyze the new position
- Evaluate the user's move
- Explain both moves

**CHAT MODE**: When the user asks a question or chats
- DO NOT change the board
- DO NOT make a move (opponent_reply must be null)
- Just respond conversationally about chess
- You can still analyze the current position if relevant

Remember: You are a tutor, not just an engine wrapper. Add pedagogical value through your explanations.`



const REQUEST_BODY = JSON.stringify({
  model: "gpt-4o-mini",
  messages: [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: "FEN: rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1\n\nWhat are the best responses for black?" }
  ]
}, null, 2);

const CURL_COMMAND = `curl http://localhost:9090/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -d '${REQUEST_BODY.replace(/'/g, "'\\''")}'`;

interface ApiInitializeTabProps {
  hasBackendSpans: boolean;
  traces: Trace[];
}

export function ApiInitializeTab({ hasBackendSpans, traces }: ApiInitializeTabProps) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  const handleCopyCommand = () => {
    navigator.clipboard.writeText(CURL_COMMAND);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStartFinetune = () => {
    navigate("/datasets/new", { state: { fromTraces: true } });
  };

  return (
    <div className="w-full flex flex-col gap-4">
      {/* Row: Code Block + Live Trace Feed */}
      <div className="flex gap-4">
        {/* Left: Code Block */}
        <div className="flex-1 rounded-xl border border-border bg-card/50 backdrop-blur-sm overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
            <div className="flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                <div className="w-3 h-3 rounded-full bg-green-500/80" />
              </div>
              <span className="text-xs text-muted-foreground ml-2">
                POST /v1/chat/completions
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyCommand}
              className="h-7 gap-1.5 text-xs"
            >
              <Copy className="w-3.5 h-3.5" />
              {copied ? "Copied!" : "COPY CURL"}
            </Button>
          </div>

          {/* Code Content */}
          <div className="p-4 overflow-auto max-h-[40vh] bg-black/20">
            <CodeBlock
              title=""
              code={CURL_COMMAND}
              language="bash"
              hideTitle
              showLineNumber={false}
            />
          </div>
        </div>

        {/* Right: Live Trace Feed */}
        <LiveTraceFeed
          isActive={hasBackendSpans}
          traces={traces}
          className="w-80 shrink-0"
        />
      </div>

      {/* Start Finetune Button - shown when traces exist */}
      {traces.length > 0 && (
        <div className="flex justify-end">
          <Button
            onClick={handleStartFinetune}
            className="bg-[rgb(var(--theme-500))] hover:bg-[rgb(var(--theme-600))] text-white gap-2"
          >
            Start Finetune
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
