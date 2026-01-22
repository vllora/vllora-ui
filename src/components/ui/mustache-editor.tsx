/**
 * MustacheEditor
 *
 * Monaco-based editor with syntax highlighting for mustache-style {{variables}}.
 * Used for editing prompt templates with variable placeholders.
 */

import { useEffect, useRef } from "react";
import Editor, { OnMount, Monaco } from "@monaco-editor/react";

// Type for the editor instance from Monaco
type MonacoEditor = Parameters<OnMount>[0];

interface MustacheEditorProps {
  value: string;
  onChange: (value: string) => void;
  /** Available variables to highlight and validate */
  variables?: Array<{ name: string; description: string }>;
  /** Use transparent background */
  transparentBackground?: boolean;
}

export function MustacheEditor({
  value,
  onChange,
  variables = [],
  transparentBackground,
}: MustacheEditorProps) {
  const editorRef = useRef<MonacoEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const decorationsRef = useRef<string[]>([]);

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Register mustache language if not exists
    if (!monaco.languages.getLanguages().some((lang: { id: string }) => lang.id === "mustache")) {
      monaco.languages.register({ id: "mustache" });

      // Define tokenizer for mustache syntax
      monaco.languages.setMonarchTokensProvider("mustache", {
        tokenizer: {
          root: [
            // Mustache variables: {{variable}}
            [/\{\{[^}]+\}\}/, "variable"],
            // XML-like tags
            [/<\/?[\w-]+>/, "tag"],
            [/<[\w-]+/, { token: "tag", next: "@tag" }],
            // Everything else
            [/./, "text"],
          ],
          tag: [
            [/\s+/, ""],
            [/[\w-]+(?=\s*=)/, "attribute.name"],
            [/=/, "delimiter"],
            [/"[^"]*"/, "attribute.value"],
            [/'[^']*'/, "attribute.value"],
            [/>/, { token: "tag", next: "@pop" }],
            [/\/>/, { token: "tag", next: "@pop" }],
          ],
        },
      });

      // Define theme colors for mustache tokens
      monaco.editor.defineTheme("mustache-dark", {
        base: "vs-dark",
        inherit: true,
        rules: [
          { token: "variable", foreground: "7dd3fc", fontStyle: "bold" }, // sky-300
          { token: "tag", foreground: "94a3b8" }, // slate-400
          { token: "attribute.name", foreground: "a5b4fc" }, // indigo-300
          { token: "attribute.value", foreground: "86efac" }, // green-300
          { token: "text", foreground: "e2e8f0" }, // slate-200
        ],
        colors: {
          "editor.background": "#18181b", // zinc-900
          "editor.lineHighlightBackground": "#27272a40",
        },
      });

      monaco.editor.defineTheme("mustache-transparent", {
        base: "vs-dark",
        inherit: true,
        rules: [
          { token: "variable", foreground: "7dd3fc", fontStyle: "bold" },
          { token: "tag", foreground: "94a3b8" },
          { token: "attribute.name", foreground: "a5b4fc" },
          { token: "attribute.value", foreground: "86efac" },
          { token: "text", foreground: "e2e8f0" },
        ],
        colors: {
          "editor.background": "#00000000",
          "editor.lineHighlightBackground": "#00000000",
          "editorGutter.background": "#00000000",
        },
      });
    }

    // Set up autocomplete for variables
    if (variables.length > 0) {
      monaco.languages.registerCompletionItemProvider("mustache", {
        triggerCharacters: ["{"],
        provideCompletionItems: (
          model: { getValueInRange: (range: object) => string; getWordUntilPosition: (pos: object) => { startColumn: number; endColumn: number } },
          position: { lineNumber: number; column: number }
        ) => {
          const textUntilPosition = model.getValueInRange({
            startLineNumber: position.lineNumber,
            startColumn: Math.max(1, position.column - 2),
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          });

          // Only suggest after {{ or {
          if (!textUntilPosition.includes("{")) {
            return { suggestions: [] };
          }

          const word = model.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          };

          const suggestions = variables.map((v) => ({
            label: `{{${v.name}}}`,
            kind: monaco.languages.CompletionItemKind.Variable,
            insertText: textUntilPosition.endsWith("{{") ? `${v.name}}}` : `{{${v.name}}}`,
            range,
            detail: v.description,
            documentation: v.description,
          }));

          return { suggestions };
        },
      });
    }

    // Apply theme
    monaco.editor.setTheme(transparentBackground ? "mustache-transparent" : "mustache-dark");

    // Update decorations for variable highlighting
    updateDecorations(editor, monaco, variables);
  };

  const updateDecorations = (
    editor: MonacoEditor,
    monaco: Monaco,
    vars: Array<{ name: string; description: string }>
  ) => {
    const model = editor.getModel();
    if (!model) return;

    const text = model.getValue();
    const decorations: Array<{
      range: ReturnType<typeof monaco.Range>;
      options: { inlineClassName: string; hoverMessage: { value: string } };
    }> = [];

    // Find all {{variable}} patterns
    const regex = /\{\{(\w+)\}\}/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const varName = match[1];
      const isKnown = vars.some((v) => v.name === varName);
      const startPos = model.getPositionAt(match.index);
      const endPos = model.getPositionAt(match.index + match[0].length);

      decorations.push({
        range: new monaco.Range(
          startPos.lineNumber,
          startPos.column,
          endPos.lineNumber,
          endPos.column
        ),
        options: {
          inlineClassName: isKnown ? "mustache-var-known" : "mustache-var-unknown",
          hoverMessage: isKnown
            ? { value: `**${varName}**: ${vars.find((v) => v.name === varName)?.description}` }
            : { value: `⚠️ Unknown variable: ${varName}` },
        },
      });
    }

    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, decorations);
  };

  // Update decorations when value changes
  useEffect(() => {
    if (editorRef.current && monacoRef.current) {
      updateDecorations(editorRef.current, monacoRef.current, variables);
    }
  }, [value, variables]);

  const handleChange = (newValue: string | undefined) => {
    onChange(newValue || "");
  };

  return (
    <div className="h-full w-full">
      <style>{`
        .mustache-var-known {
          background-color: rgba(125, 211, 252, 0.15);
          border-radius: 2px;
        }
        .mustache-var-unknown {
          background-color: rgba(251, 191, 36, 0.2);
          border-radius: 2px;
          text-decoration: wavy underline;
          text-decoration-color: #fbbf24;
        }
      `}</style>
      <Editor
        height="100%"
        defaultLanguage="mustache"
        value={value}
        onChange={handleChange}
        theme={transparentBackground ? "mustache-transparent" : "mustache-dark"}
        onMount={handleEditorMount}
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          lineNumbers: transparentBackground ? "off" : "on",
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          wordWrap: "on",
          lineHeight: 1.6,
          padding: { top: 16, bottom: 16 },
          renderLineHighlight: "none",
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          scrollbar: {
            vertical: "auto",
            horizontal: "hidden",
            verticalScrollbarSize: 8,
          },
        }}
      />
    </div>
  );
}
