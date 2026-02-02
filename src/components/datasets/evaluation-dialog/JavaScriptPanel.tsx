/**
 * JavaScriptPanel
 *
 * Panel for editing JavaScript evaluation code.
 */

import { Button } from "@/components/ui/button";
import Editor from "@monaco-editor/react";
import {
  Code2,
  Copy,
  RotateCcw,
} from "lucide-react";

interface JavaScriptPanelProps {
  value: string;
  onChange: (value: string) => void;
}

const DEFAULT_SCRIPT = `/**
 * Evaluate the quality of an AI response using LLM-as-a-Judge.
 *
 * Available globals:
 * - __langdb_call_llm_as_judge_obj(prompt): Calls the configured LLM model
 *   and returns a parsed object with { score, reasoning }
 *
 * @param {Object} input - The input object containing messages
 * @param {Array} input.messages - The conversation messages
 * @param {Object} output - The output object containing the response
 * @param {Object|Array} output.messages - The assistant's response
 * @returns {Object} - Evaluation result with score and reasoning
 */
function evaluate(input, output) {
  // Extract the user query from input messages
  const userMessages = input.messages?.filter(m => m.role === 'user') || [];
  const query = userMessages[userMessages.length - 1]?.content || '';

  // Extract the assistant's response
  const response = Array.isArray(output.messages)
    ? output.messages.map(m => m.content).join('\\n')
    : output.messages?.content || '';

  // Build the evaluation prompt for the LLM judge
  const prompt = \`You are an expert evaluator assessing the quality of an AI assistant's response.

User Query:
\${query}

Assistant Response:
\${response}

Evaluate the response on the following criteria:
1. Relevance: Does it directly address the user's question?
2. Accuracy: Is the information correct and reliable?
3. Completeness: Does it fully answer the question?
4. Clarity: Is it well-structured and easy to understand?

Provide your evaluation as JSON with:
- score: A number from 1-5 (1=poor, 5=excellent)
- reasoning: A brief explanation of your score\`;

  // Call the LLM judge and get structured result
  const result = __langdb_call_llm_as_judge_obj(prompt);

  return {
    score: result.score,
    reasoning: result.reasoning,
  };
}
`;

export function JavaScriptPanel({
  value,
  onChange,
}: JavaScriptPanelProps) {
  const handleCopy = () => {
    navigator.clipboard.writeText(value);
  };

  const handleReset = () => {
    onChange(DEFAULT_SCRIPT);
  };

  return (
    <div className="flex flex-col overflow-hidden h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <Code2 className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">JavaScript Evaluator</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={handleReset}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={handleCopy}
          >
            <Copy className="w-3.5 h-3.5" />
            Copy
          </Button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        <Editor
          height="100%"
          language="javascript"
          value={value}
          onChange={(v) => onChange(v || "")}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            wordWrap: "on",
            automaticLayout: true,
            tabSize: 2,
            padding: { top: 16, bottom: 16 },
            scrollbar: {
              vertical: "auto",
              horizontal: "hidden",
              verticalScrollbarSize: 8,
            },
          }}
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between h-10 px-5 border-t border-border bg-muted/30">
        <p className="text-xs text-muted-foreground">
          Use <code className="text-[rgb(var(--theme-400))]">__langdb_call_llm_as_judge_obj(prompt)</code> to call the LLM judge
        </p>
      </div>
    </div>
  );
}

export { DEFAULT_SCRIPT };
