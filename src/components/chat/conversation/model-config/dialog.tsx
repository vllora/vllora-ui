import { useRef } from "react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { ConfigStep } from "./config-step";
import { SaveStep } from "./save-step";
import { ModeSwitchWarning } from "./mode-switch-warning";
import { SaveVirtualModelFormRef } from "./save-virtual-model-form";
import { ModelConfigDialogConsumer, ModelConfigDialogProvider } from "./useModelConfigDialog";

interface ModelConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfigChange?: (config: Record<string, any>) => void;
  initialConfig?: Record<string, any>;
  projectId?: string;
  title?: string;
  description?: string;
}



export function ModelConfigDialog({
  open,
  onOpenChange,
  onConfigChange,
  initialConfig = {},
  projectId,
  title = "Model Configuration",
  description = "Fine-tune parameters, caching, fallbacks, and retries for optimal performance",
}: ModelConfigDialogProps) {

  return (
    <ModelConfigDialogProvider open={open} onOpenChange={onOpenChange} onConfigChange={onConfigChange} initialConfig={initialConfig} projectId={projectId} modified_mode="model_config">
      <ModelConfigDialogInner open={open} title={title} description={description} />
    </ModelConfigDialogProvider>
  );
}

export const ModelConfigDialogInner = ({ open, title, description }: { open: boolean; title?: string; description?: string }) => {
  const saveFormRef = useRef<SaveVirtualModelFormRef>(null);
  const { step, config, showWarning, complexFeatures, virtualModelName, isCreateMode, creating, setConfig, setShowWarning, setStep, setVirtualModelName, handleModeSwitch, confirmModeSwitch, handleSaveAsVirtualModel, handleApplyVirtualModel, handleClearVirtualModel, modified_mode, onOpenChange } = ModelConfigDialogConsumer()

  return <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
    <DialogContent className="max-w-[60vw] h-[80vh] overflow-hidden flex flex-col">
      {step === 'config' ? (
        <ConfigStep
          onModeChange={handleModeSwitch}
          config={config}
          onConfigChange={setConfig}
          onSaveAsVirtualModel={() => setStep('save')}
          title={title}
          description={description}
          virtualModelName={virtualModelName}
          onVirtualModelNameChange={setVirtualModelName}
          isSaving={creating}
          onApplyVirtualModel={!isCreateMode ? handleApplyVirtualModel : undefined}
          onClearVirtualModel={!isCreateMode ? handleClearVirtualModel : undefined}
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
      {modified_mode === 'model_config' && <ModeSwitchWarning
        open={showWarning}
        onOpenChange={setShowWarning}
        complexFeatures={complexFeatures}
        onConfirm={() => {
          setShowWarning(false);
          confirmModeSwitch();
        }}
      />}
    </DialogContent>
  </Dialog>
}