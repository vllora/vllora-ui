import { useMemo } from "react";
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

    // If in edit mode but virtual model not found, don't render
    if (virtualModelSlug && !virtualModel && open) {
      console.warn(`Virtual model with slug "${virtualModelSlug}" not found`);
      return null;
    }

    const title = virtualModelSlug ? `Edit ${virtualModel?.name || virtualModelSlug}` : 'Create Virtual Model'

    // Memoize initialConfig to prevent re-renders
    const initialConfig = useMemo(() => {
      const latestVersion = virtualModel?.versions.find((v) => v.latest === true)
      const lastVersion = virtualModel?.versions[virtualModel?.versions.length - 1]
      return latestVersion?.target_configuration || lastVersion?.target_configuration || {
        model: 'openai/gpt-4o-mini'
      }
    }, [virtualModel])
  return (
      <ModelConfigDialogProvider open={open} onOpenChange={onOpenChange} onConfigChange={()=>{}} initialConfig={initialConfig} projectId={projectId} modified_mode={virtualModelSlug ? 'edit' : 'create'} virtualModelSlug={virtualModelSlug}>
        <ModelConfigDialogInner open={open} title={title} description={description} />
      </ModelConfigDialogProvider>
    );
}