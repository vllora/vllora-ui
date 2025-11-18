import { useMemo, useState, useEffect } from "react";
import { VirtualModelsConsumer } from "@/lib";
import { ModelConfigDialogProvider } from "./useModelConfigDialog";
import { ModelConfigDialogInner } from "./dialog";
import { getValidVersion } from "./utils";


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

    // State for selected version number
    const [selectedVersion, setSelectedVersion] = useState<number | undefined>(undefined);

    // Reset selected version when dialog opens/closes or virtual model changes
    useEffect(() => {
      if (open && virtualModel) {
        const validVersion = getValidVersion(virtualModel)
        setSelectedVersion(validVersion?.version);
      } else if (!open) {
        setSelectedVersion(undefined);
      }
    }, [open, virtualModel]);

    // If in edit mode but virtual model not found, don't render
    if (virtualModelSlug && !virtualModel && open) {
      console.warn(`Virtual model with slug "${virtualModelSlug}" not found`);
      return null;
    }

    const title = virtualModelSlug ? `Edit ${virtualModel?.name || virtualModelSlug}` : 'Create Virtual Model'

    // Memoize initialConfig based on selected version
    const initialConfig = useMemo(() => {
      if (virtualModel && selectedVersion !== undefined) {
        const version = getValidVersion(virtualModel);
        if (version) {
          return version.target_configuration;
        }
      }
      if(virtualModel && selectedVersion !== undefined) {
        const version = virtualModel.versions.find((v) => v.version === selectedVersion);
        if (version) {
          return version.target_configuration;
        }
      }

      // Fallback for create mode or if no version selected
      const latestVersion = virtualModel?.versions.find((v) => v.latest === true);
      const lastVersion = virtualModel?.versions[virtualModel?.versions.length - 1];
      return latestVersion?.target_configuration || lastVersion?.target_configuration || {
        model: 'openai/gpt-4o-mini'
      };
    }, [virtualModel, selectedVersion]);

  return (
      <ModelConfigDialogProvider
        open={open}
        onOpenChange={onOpenChange}
        onConfigChange={()=>{}}
        initialConfig={initialConfig}
        projectId={projectId}
        modified_mode={virtualModelSlug ? 'edit' : 'create'}
        virtualModelSlug={virtualModelSlug}
        selectedVersion={selectedVersion}
        onVersionChange={setSelectedVersion}
      >
        <ModelConfigDialogInner open={open} title={title} description={description} />
      </ModelConfigDialogProvider>
    );
}