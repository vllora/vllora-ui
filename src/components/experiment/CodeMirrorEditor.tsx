import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, placeholder as placeholderExt } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, undo, redo } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { syntaxHighlighting, defaultHighlightStyle } from "@codemirror/language";
import {
  Bold,
  Italic,
  Code,
  Heading1,
  Heading2,
  List,
  ListOrdered,
  Quote,
  Undo,
  Redo,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface CodeMirrorEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  showToolbar?: boolean;
  minHeight?: string;
  maxHeight?: string;
  fullHeight?: boolean;
}

export function CodeMirrorEditor({
  content,
  onChange,
  placeholder = "Enter content...",
  showToolbar = false,
  minHeight = "80px",
  maxHeight,
  fullHeight = false,
}: CodeMirrorEditorProps) {
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);

  // Keep onChange ref updated
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Initialize editor
  useEffect(() => {
    if (!editorContainerRef.current) return;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChangeRef.current(update.state.doc.toString());
      }
    });

    const theme = EditorView.theme({
      "&": {
        backgroundColor: "transparent",
        color: "hsl(var(--foreground))",
        fontSize: "14px",
        ...(fullHeight ? { height: "100%", flex: "1" } : {}),
      },
      ".cm-content": {
        padding: "12px",
        minHeight: fullHeight ? "100%" : minHeight,
        ...(maxHeight && !fullHeight ? { maxHeight } : {}),
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        caretColor: "hsl(var(--foreground))",
      },
      ".cm-gutters": {
        display: "none",
      },
      ".cm-focused": {
        outline: "none",
      },
      ".cm-scroller": {
        overflow: "auto",
        ...(fullHeight ? { height: "100%" } : {}),
      },
      "&.cm-focused .cm-cursor": {
        borderLeftColor: "hsl(var(--foreground))",
      },
      ".cm-selectionBackground, ::selection": {
        backgroundColor: "hsl(var(--primary) / 0.3) !important",
      },
      ".cm-placeholder": {
        color: "hsl(var(--muted-foreground))",
      },
      ".cm-activeLine": {
        backgroundColor: "transparent",
      },
      ".cm-activeLineGutter": {
        backgroundColor: "transparent",
      },
    });

    const state = EditorState.create({
      doc: content,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown(),
        syntaxHighlighting(defaultHighlightStyle),
        theme,
        updateListener,
        placeholderExt(placeholder),
        EditorView.lineWrapping,
      ],
    });

    const view = new EditorView({
      state,
      parent: editorContainerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  // Sync external content changes
  useEffect(() => {
    const view = viewRef.current;
    if (view && content !== view.state.doc.toString()) {
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: content,
        },
      });
    }
  }, [content]);

  // Toolbar actions
  const wrapSelection = (before: string, after: string) => {
    const view = viewRef.current;
    if (!view) return;

    const { from, to } = view.state.selection.main;
    const selectedText = view.state.sliceDoc(from, to);

    view.dispatch({
      changes: { from, to, insert: `${before}${selectedText}${after}` },
      selection: { anchor: from + before.length, head: to + before.length },
    });
    view.focus();
  };

  const insertAtLineStart = (prefix: string) => {
    const view = viewRef.current;
    if (!view) return;

    const { from } = view.state.selection.main;
    const line = view.state.doc.lineAt(from);

    view.dispatch({
      changes: { from: line.from, to: line.from, insert: prefix },
      selection: { anchor: from + prefix.length },
    });
    view.focus();
  };

  const handleUndo = () => {
    const view = viewRef.current;
    if (view) {
      undo(view);
      view.focus();
    }
  };

  const handleRedo = () => {
    const view = viewRef.current;
    if (view) {
      redo(view);
      view.focus();
    }
  };

  const toolbarButtons = [
    { icon: Bold, label: "Bold", action: () => wrapSelection("**", "**") },
    { icon: Italic, label: "Italic", action: () => wrapSelection("*", "*") },
    { icon: Code, label: "Code", action: () => wrapSelection("`", "`") },
    { icon: Heading1, label: "Heading 1", action: () => insertAtLineStart("# ") },
    { icon: Heading2, label: "Heading 2", action: () => insertAtLineStart("## ") },
    { icon: List, label: "Bullet List", action: () => insertAtLineStart("- ") },
    { icon: ListOrdered, label: "Numbered List", action: () => insertAtLineStart("1. ") },
    { icon: Quote, label: "Quote", action: () => insertAtLineStart("> ") },
    { icon: Undo, label: "Undo", action: handleUndo },
    { icon: Redo, label: "Redo", action: handleRedo },
  ];

  const containerClasses = fullHeight
    ? "border border-border rounded-lg overflow-hidden bg-background h-full flex flex-col"
    : "border border-border rounded-lg overflow-hidden bg-background";

  return (
    <div className={containerClasses}>
      {showToolbar && (
        <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border bg-muted/30 flex-shrink-0">
          <TooltipProvider delayDuration={300}>
            {toolbarButtons.map(({ icon: Icon, label, action }) => (
              <Tooltip key={label}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={action}
                    className="p-1.5 rounded transition-colors text-muted-foreground hover:text-foreground hover:bg-muted"
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{label}</TooltipContent>
              </Tooltip>
            ))}
          </TooltipProvider>
        </div>
      )}
      <div
        ref={editorContainerRef}
        className={fullHeight ? "flex-1 overflow-hidden" : ""}
        style={fullHeight ? undefined : { minHeight, maxHeight }}
      />
    </div>
  );
}
