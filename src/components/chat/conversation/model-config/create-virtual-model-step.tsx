import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ModelInfo } from "@/types/models";
import { ModelConfigDialogHeader } from "./dialog-header";
import { ModelConfigDialogContent } from "./dialog-content";
import { JsonEditor } from "./json-editor";

interface CreateVirtualModelStepProps {
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
  title?: string;
  description?: string;
  virtualModelName: string;
  onVirtualModelNameChange: (name: string) => void;
  isSaving: boolean;
}

export function CreateVirtualModelStep({
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
  title = "Create Virtual Model",
  description = "Configure your model parameters and settings to create a reusable virtual model",
  virtualModelName,
  onVirtualModelNameChange,
  isSaving,
}: CreateVirtualModelStepProps) {
  return (
    <>
      <ModelConfigDialogHeader
        title={title}
        description={description}
        mode={mode}
        onModeChange={onModeChange}
      />

      {/* Virtual Model Name Input */}
      <div className="px-6 pb-2 border-b">
        <Label htmlFor="virtual-model-name" className="text-sm font-semibold">
          Virtual Model Name <span className="text-red-500">*</span>
        </Label>
        <Input
          id="virtual-model-name"
          placeholder="Enter a name for this virtual model"
          value={virtualModelName}
          onChange={(e) => onVirtualModelNameChange(e.target.value)}
          className="mt-2"
        />
      </div>

      {/* Configuration Content */}
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

      {/* Footer */}
      <DialogFooter className="gap-2 border-t pt-4">
        <div className="flex-1" />
        <Button variant="outline" onClick={onReset}>
          Reset to Defaults
        </Button>
        <Button
          onClick={onSave}
          disabled={isSaving || !virtualModelName.trim()}
        >
          {isSaving ? 'Creating...' : 'Create Virtual Model'}
        </Button>
      </DialogFooter>
    </>
  );
}
