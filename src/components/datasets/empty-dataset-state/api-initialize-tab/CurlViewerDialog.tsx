/**
 * CurlViewerDialog
 *
 * Dialog for viewing the full curl command in a Monaco editor.
 * Read-only, syntax-highlighted, with a copy button.
 */

import { useState } from "react";
import Editor from "@monaco-editor/react";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

interface CurlViewerDialogProps {
  curlCommand: string;
  children: React.ReactNode;
}

export function CurlViewerDialog({
  curlCommand,
  children,
}: CurlViewerDialogProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(curlCommand);
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-2xl p-0 gap-0 rounded-xl border-border/50 bg-[hsl(var(--card))]">
        <DialogHeader className="px-5 pt-5 pb-3 border-b border-border/30">
          <div className="flex items-center justify-between pr-8">
            <DialogTitle className="text-sm font-semibold">
              Full curl command
            </DialogTitle>
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[rgb(var(--theme-500))]" />
                  <span className="text-[rgb(var(--theme-500))]">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
          <DialogDescription className="sr-only">
            The full curl command to proxy requests through the gateway
          </DialogDescription>
        </DialogHeader>
        <div className="h-[50vh]">
          <Editor
            height="100%"
            defaultLanguage="json"
            value={curlCommand}
            theme="curl-viewer"
            options={{
              readOnly: true,
              minimap: { enabled: false },
              fontSize: 13,
              lineNumbers: "off",
              scrollBeyondLastLine: false,
              automaticLayout: true,
              wordWrap: "on",
              folding: false,
              renderLineHighlight: "none",
              overviewRulerLanes: 0,
              hideCursorInOverviewRuler: true,
              scrollbar: {
                vertical: "auto",
                horizontal: "hidden",
                verticalScrollbarSize: 6,
              },
              padding: { top: 16, bottom: 16 },
              domReadOnly: true,
            }}
            beforeMount={(monaco) => {
              monaco.editor.defineTheme("curl-viewer", {
                base: "vs-dark",
                inherit: true,
                rules: [],
                colors: {
                  "editor.background": "#0a0a0a",
                  "editor.lineHighlightBackground": "#00000000",
                  "editorGutter.background": "#00000000",
                },
              });
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
