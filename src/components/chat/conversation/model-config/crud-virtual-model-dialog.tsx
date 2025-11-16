import { VirtualModelsConsumer } from "@/lib";
import { ModelConfigDialogProvider } from "./useModelConfigDialog";
import { ModelConfigDialogInner } from "./dialog";


export function VirtualModelCRUDDialog(props:{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string;
  virtualModelSlug?: string;
  description?: string;
}) {
    const {virtualModelSlug, projectId, description, open, onOpenChange} = props
    const { virtualModels } = VirtualModelsConsumer()
    const virtualModel = virtualModels.find((vm) => vm.slug === virtualModelSlug)
    const title = virtualModelSlug ? `Edit ${virtualModelSlug}` : 'Create Virtual Model'
    let latestVersion = virtualModel?.versions.find((v) => v.latest === true)
    let lastVersion = virtualModel?.versions[virtualModel?.versions.length - 1]
    let initialConfig = latestVersion?.target_configuration || lastVersion?.target_configuration || {
      model: 'openai/gpt-4o-mini'
    }
  return (
      <ModelConfigDialogProvider open={open} onOpenChange={onOpenChange} onConfigChange={()=>{}} initialConfig={initialConfig} projectId={projectId} modified_mode={virtualModelSlug ? 'edit' : 'create'} virtualModelSlug={virtualModelSlug}>
        <ModelConfigDialogInner open={open} title={title} description={description} />
      </ModelConfigDialogProvider>
    );
}