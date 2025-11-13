import { ModelInfo } from "@/types/models";
import { CreateVirtualModelStep } from "./create-virtual-model-step";
import { ConfigureModelStep } from "./configure-model-step";

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
  title?: string;
  description?: string;
  isCreateMode?: boolean;
  virtualModelName?: string;
  onVirtualModelNameChange?: (name: string) => void;
  isSaving?: boolean;
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

  return <ConfigureModelStep {...commonProps} />;
}
