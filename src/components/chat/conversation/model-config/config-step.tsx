import { CreateVirtualModelStep } from "./create-virtual-model-step";
import { ConfigureModelStep } from "./configure-model-step";
import { VirtualModel } from "@/services/virtual-models-api";

interface ConfigStepProps {
  onModeChange: (mode: 'basic' | 'advanced') => void;
  config: Record<string, any>;
  onConfigChange: (config: Record<string, any>) => void;
  onReset: () => void;
  onSave: () => void;
  onSaveAsVirtualModel: () => void;
  title?: string;
  description?: string;
  isCreateMode?: boolean;
  virtualModelName?: string;
  onVirtualModelNameChange?: (name: string) => void;
  isSaving?: boolean;
  onApplyVirtualModel?: (virtualModel: VirtualModel, mode: 'base' | 'copy') => void;
  onClearVirtualModel?: () => void;
}

export function ConfigStep(props: ConfigStepProps) {
  const {
    isCreateMode = false,
    virtualModelName = '',
    onVirtualModelNameChange,
    isSaving = false,
    ...commonProps
  } = props;

  if (isCreateMode) {
    return (
      <CreateVirtualModelStep
        {...commonProps}
        virtualModelName={virtualModelName}
        onVirtualModelNameChange={onVirtualModelNameChange!}
        isSaving={isSaving}
      />
    );
  }

  return (
    <ConfigureModelStep
      {...commonProps}
    />
  );
}
