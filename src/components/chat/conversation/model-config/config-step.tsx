import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { ModelInfo } from "@/types/models";
import { ModelConfigDialogHeader } from "./dialog-header";
import { ModelConfigDialogContent } from "./dialog-content";
import { JsonEditor } from "./json-editor";
import { BookmarkPlus } from "lucide-react";

interface ConfigStepProps {
  mode: 'basic' | 'advanced';
  onModeChange: (mode: 'basic' | 'advanced') => void;
  selectedModel?: string;
  onModelChange?: (model: string) => void;
  config: Record<string, any>;
  onConfigChange: (config: Record<string, any>) => void;
  modelInfo: ModelInfo;
  jsonContent: string;
  onJsonContentChange: (content: string) => void;
  onReset: () => void;
  onSave: () => void;
  onSaveAsVirtualModel: () => void;
}

export function ConfigStep({
  mode,
  onModeChange,
  selectedModel,
  onModelChange,
  config,
  onConfigChange,
  modelInfo,
  jsonContent,
  onJsonContentChange,
  onReset,
  onSave,
  onSaveAsVirtualModel,
}: ConfigStepProps) {
  return (
    <>
      <ModelConfigDialogHeader
        title="Model Configuration"
        description="Fine-tune parameters, caching, fallbacks, and retries for optimal performance"
        mode={mode}
        onModeChange={onModeChange}
      />

      {/* Conditional Rendering based on mode */}
      {mode === 'basic' ? (
        <ModelConfigDialogContent
          selectedModel={selectedModel}
          onModelChange={onModelChange}
          config={config}
          onConfigChange={onConfigChange}
          modelInfo={modelInfo}
        />
      ) : (
        <div className="flex-1 overflow-hidden px-6 py-4">
          <JsonEditor
            value={jsonContent}
            onChange={onJsonContentChange}
          />
        </div>
      )}

      <DialogFooter className="gap-2 border-t pt-4">
        <Button
          variant="outline"
          onClick={onSaveAsVirtualModel}
          className="gap-2"
        >
          <BookmarkPlus className="h-4 w-4" />
          Save as Virtual Model
        </Button>
        <div className="flex-1" />
        <Button variant="outline" onClick={onReset}>
          Reset to Defaults
        </Button>
        <Button onClick={onSave}>Done</Button>
      </DialogFooter>
    </>
  );
}
