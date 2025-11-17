import { ModelConfigDialogConsumer } from "../useModelConfigDialog";
import { ModelConfigMode } from "./model-config";
import { CreateEditMode } from "./create-edit-mode";

export function ModelConfigDialogContent() {
  const { modified_mode } = ModelConfigDialogConsumer();
  if(modified_mode === 'model_config') {
    return <ModelConfigMode/>
  }
  return <CreateEditMode/>
}
