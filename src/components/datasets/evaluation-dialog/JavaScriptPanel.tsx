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
 * Evaluate the quality of an AI response.
 *
 * @param {Object} input - The input object containing messages
 * @param {Array} input.messages - The conversation messages
 * @param {Object} output - The output object containing the response
 * @param {Object|Array} output.messages - The assistant's response
 * @returns {Object} - Evaluation result with score and reasoning
 */
function evaluate(input, output) {
  // Extract the assistant's response
  const response = Array.isArray(output.messages)
    ? output.messages.map(m => m.content).join('\\n')
    : output.messages?.content || '';

  // Example evaluation logic
  let score = 3;
  let reasoning = 'Default score';

  // Check response length
  if (response.length > 500) {
    score += 1;
    reasoning = 'Detailed response';
  }

  // Check for code blocks
  if (response.includes('\`\`\`')) {
    score += 1;
    reasoning = 'Includes code examples';
  }

  return {
    score: Math.min(score, 5),
    reasoning: reasoning,
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
          Function signature: <code className="text-[rgb(var(--theme-400))]">evaluate(input, output)</code> → <code className="text-[rgb(var(--theme-400))]">{`{ score, reasoning }`}</code>
        </p>
      </div>
    </div>
  );
}

export { DEFAULT_SCRIPT };
