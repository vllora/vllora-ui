import { useRef } from "react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { ModelInfo } from "@/types/models";
import { ConfigStep } from "./config-step";
import { SaveStep } from "./save-step";
import { ModeSwitchWarning } from "./mode-switch-warning";
import { SaveVirtualModelFormRef } from "./save-virtual-model-form";
import { useModelConfigDialog } from "./useModelConfigDialog";

interface ModelConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modelInfo: ModelInfo;
  onConfigChange?: (config: Record<string, any>) => void;
  initialConfig?: Record<string, any>;
  selectedModel?: string;
  onModelChange?: (model: string) => void;
  projectId?: string;
  title?: string;
  description?: string;
}

export function ModelConfigDialog({
  open,
  onOpenChange,
  modelInfo,
  onConfigChange,
  initialConfig = {},
  selectedModel,
  onModelChange,
  projectId,
  title = "Model Configuration",
  description = "Fine-tune parameters, caching, fallbacks, and retries for optimal performance",
}: ModelConfigDialogProps) {
  const saveFormRef = useRef<SaveVirtualModelFormRef>(null);

  // Use the custom hook for all dialog logic
  const {
    mode,
    config,
    jsonContent,
    showWarning,
    complexFeatures,
    step,
    virtualModelName,
    isCreateMode,
    creating,
    setConfig,
    setJsonContent,
    setShowWarning,
    setStep,
    setVirtualModelName,
    handleSave,
    handleReset,
    handleModeSwitch,
    confirmModeSwitch,
    handleSaveAsVirtualModel,
    handleApplyVirtualModel,
  } = useModelConfigDialog({
    open,
    modelInfo,
    onConfigChange,
    initialConfig,
    selectedModel,
    onModelChange,
    projectId,
    onOpenChange,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[60vw] h-[80vh] overflow-hidden flex flex-col">
        {step === 'config' ? (
          <ConfigStep
            mode={mode}
            onModeChange={handleModeSwitch}
            selectedModel={selectedModel}
            onModelChange={onModelChange}
            config={config}
            onConfigChange={setConfig}
            modelInfo={modelInfo}
            jsonContent={jsonContent}
            onJsonContentChange={setJsonContent}
            onReset={handleReset}
            onSave={handleSave}
            onSaveAsVirtualModel={() => setStep('save')}
            title={title}
            description={description}
            isCreateMode={isCreateMode}
            virtualModelName={virtualModelName}
            onVirtualModelNameChange={setVirtualModelName}
            isSaving={creating}
            onApplyVirtualModel={!isCreateMode ? handleApplyVirtualModel : undefined}
          />
        ) : (
          <SaveStep
            ref={saveFormRef}
            onSave={handleSaveAsVirtualModel}
            onBack={() => setStep('config')}
            isSaving={creating}
          />
        )}

        {/* Warning dialog for complex features */}
        <ModeSwitchWarning
          open={showWarning}
          onOpenChange={setShowWarning}
          complexFeatures={complexFeatures}
          onConfirm={() => {
            setShowWarning(false);
            confirmModeSwitch();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
