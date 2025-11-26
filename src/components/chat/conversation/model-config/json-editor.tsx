import { useState, useEffect } from "react";
import Editor from "@monaco-editor/react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, CheckCircle2 } from "lucide-react";

interface JsonValidationStatusProps {
  value: string;
  error: string | null;
}

export function JsonValidationStatus({ value, error }: JsonValidationStatusProps) {
  if (error) {
    return (
      <Alert variant="destructive" className="py-2 flex items-center">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="text-xs">
          <strong>JSON Error:</strong> {error}
        </AlertDescription>
      </Alert>
    );
  }

  if (value.trim()) {
    return (
      <div className="py-2 px-2 rounded-md border-green-500/50 bg-green-500/10 flex gap-2 items-center">
        <CheckCircle2 className="h-4 w-4 text-green-500" />
        <span className="text-xs text-green-600 dark:text-green-400">
          Valid JSON
        </span>
      </div>
    );
  }

  return null;
}

interface JsonEditorProps {
  value: string;
  onChange: (value: string) => void;
  hideValidation?: boolean;
  transparentBackground?: boolean;
  disableStickyScroll?: boolean;
}

export function JsonEditor({ value, onChange, hideValidation, transparentBackground, disableStickyScroll }: JsonEditorProps) {
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Validate JSON whenever value changes
  useEffect(() => {
    try {
      if (value.trim()) {
        JSON.parse(value);
        setJsonError(null);
      } else {
        setJsonError(null);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Invalid JSON";
      setJsonError(errorMessage);
    }
  }, [value]);

  const handleEditorChange = (newValue: string | undefined) => {
    const jsonValue = newValue || "";
    onChange(jsonValue);
  };

  return (
    <div className="flex flex-col h-full gap-3">
      {!hideValidation && (
        <JsonValidationStatus value={value} error={jsonError} />
      )}

      {/* Monaco Editor */}
      <div className={`flex-1 overflow-hidden ${transparentBackground ? "" : "rounded-lg border border-border"}`}>
        <Editor
          height="100%"
          defaultLanguage="json"
          value={value}
          onChange={handleEditorChange}
          theme={transparentBackground ? "transparent" : "vs-dark"}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: transparentBackground ? 'off': 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            wordWrap: "on",
            formatOnPaste: true,
            formatOnType: true,
            stickyScroll: {
              enabled: !disableStickyScroll
            }
          }}
          beforeMount={(monaco) => {
            monaco.editor.defineTheme("transparent", {
              base: "vs-dark",
              inherit: true,
              rules: [],
              colors: {
                "editor.background": "#00000000",
                "editor.lineHighlightBackground": "#00000000",
                "editorGutter.background": "#00000000",
              },
            });
          }}
        />
      </div>
    </div>
  );
}
