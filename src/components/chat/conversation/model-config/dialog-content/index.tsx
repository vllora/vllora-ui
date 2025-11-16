import { ModelConfigDialogConsumer } from "../useModelConfigDialog";
import { ModelConfigMode } from "./model-config";
import { CreateEditMode } from "./create-edit-mode";


// interface ModelConfigDialogContentProps {
//   config: Record<string, any>;
//   onConfigChange: (config: Record<string, any>) => void;
//   onApplyVirtualModel?: (virtualModel: VirtualModel, mode: 'base' | 'copy') => void;
//   onClearVirtualModel?: () => void;
// }

export function ModelConfigDialogContent() {
  const { modified_mode } = ModelConfigDialogConsumer();
  if(modified_mode === 'model_config') {
    return <ModelConfigMode/>
  }
  return <CreateEditMode/>
}
