import { CreateVirtualModelStep } from "./create-virtual-model-step";
import { ConfigureModelStep } from "./configure-model-step";
import { VirtualModel } from "@/services/virtual-models-api";
import { ModelConfigDialogConsumer } from "./useModelConfigDialog";

interface ConfigStepProps {
  onModeChange: (mode: 'basic' | 'advanced') => void;
  config: Record<string, any>;
  onConfigChange: (config: Record<string, any>) => void;
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
    onVirtualModelNameChange,
    isSaving = false,
    ...commonProps
  } = props;
  const { modified_mode } = ModelConfigDialogConsumer()

  if (modified_mode === 'create' || modified_mode === 'edit') {
    return (
      <CreateVirtualModelStep
        {...commonProps}
        title={modified_mode === 'create' ? 'Create Virtual Model' : 'Edit Virtual Model'}
        description={modified_mode === 'create' ? 'Configure your model parameters and settings to create a reusable virtual model' : 'Configure your model parameters and settings to create a reusable virtual model'}
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
