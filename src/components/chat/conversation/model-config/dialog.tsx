import { useRef } from "react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { ModelInfo } from "@/types/models";
import { VirtualModel } from "@/services/virtual-models-api";
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
    <ModelConfigDialogProvider open={open} onOpenChange={onOpenChange} onConfigChange={onConfigChange} initialConfig={initialConfig} projectId={projectId}>
      <DialogInner open={open} onOpenChange={onOpenChange} title={title} description={description} />
    </ModelConfigDialogProvider>
  );
}

const DialogInner = ({ open, onOpenChange, title, description }: { open: boolean; onOpenChange: (open: boolean) => void; title?: string; description?: string }) => {
  const saveFormRef = useRef<SaveVirtualModelFormRef>(null);
  const { step, config, showWarning, complexFeatures, virtualModelName, isCreateMode, creating, setConfig, setShowWarning, setStep, setVirtualModelName, handleSave, handleReset, handleModeSwitch, confirmModeSwitch, handleSaveAsVirtualModel, handleApplyVirtualModel, handleClearVirtualModel } = ModelConfigDialogConsumer()
  return <Dialog open={open} onOpenChange={onOpenChange} modal={false}>
    <DialogContent className="max-w-[60vw] h-[80vh] overflow-hidden flex flex-col">
      {step === 'config' ? (
        <ConfigStep
          onModeChange={handleModeSwitch}
          config={config}
          onConfigChange={setConfig}
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
}