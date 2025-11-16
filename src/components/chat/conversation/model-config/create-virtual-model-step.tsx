import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { ModelConfigDialogHeader } from "./dialog-header";
import { ModelConfigDialogContent } from "./dialog-content";
import { JsonEditor } from "./json-editor";
import { ModelConfigDialogConsumer } from "./useModelConfigDialog";
import { VirtualModelNameInput } from "./dialog-content/name-input";
import { VirtualModelsConsumer } from "@/contexts/VirtualModelsContext";
import { VirtualModel } from "@/services/virtual-models-api";

interface CreateVirtualModelStepProps {
  title?: string;
  description?: string;
  isSaving: boolean;
}

export function CreateVirtualModelStep({
  title = "Create Virtual Model",
  description = "Configure your model parameters and settings to create a reusable virtual model",
  isSaving,
}: CreateVirtualModelStepProps) {
  const { mode, jsonContent, setJsonContent, handleReset, handleSaveAsVirtualModel, virtualModelName, setVirtualModelName, modified_mode, onOpenChange, selectedVersion, virtualModelSlug } = ModelConfigDialogConsumer()
  const { virtualModels, updateVersionMeta, updatingVersionMeta } = VirtualModelsConsumer();

  // Get the current virtual model and selected version
  const virtualModel = virtualModels.find((vm: VirtualModel) => vm.slug === virtualModelSlug);
  const currentVersion = virtualModel?.versions.find((v: any) => v.version === selectedVersion);
  const isCurrentVersionLatest = currentVersion?.latest === true;

  const handleMarkAsLatest = async () => {
    if (!virtualModel || selectedVersion === undefined) return;

    try {
      await updateVersionMeta({
        virtualModelId: virtualModel.id,
        version: selectedVersion,
        latest: true,
        is_published: true,
      });
    } catch (error) {
      console.error("Error marking version as latest:", error);
    }
  };

  return (
    <>
      <ModelConfigDialogHeader
        title={title}
        description={description}
      />
      {/* Configuration Content */}
      {mode === 'basic' ? (
        <ModelConfigDialogContent />
      ) : (
        <div className="flex-1 overflow-hidden px-6">
          {modified_mode === 'create' || modified_mode === 'edit' ? (
            <VirtualModelNameInput virtualModelName={virtualModelName} setVirtualModelName={setVirtualModelName} />
          ) : null}
          <JsonEditor
            value={jsonContent}
            onChange={setJsonContent}
          />
        </div>
      )}

      {/* Footer */}
      <DialogFooter className="gap-2 border-t pt-4">
        <div className="flex-1">
          {/* Mark as Latest Button - Only show when editing a version that's not already latest */}
          {modified_mode === 'edit' && selectedVersion !== undefined && !isCurrentVersionLatest && (
            <Button
              variant="outline"
              onClick={handleMarkAsLatest}
              disabled={updatingVersionMeta}
            >
              {updatingVersionMeta ? 'Marking...' : 'Mark as Latest'}
            </Button>
          )}
        </div>
        <Button variant="outline" onClick={handleReset}>
          Reset to Defaults
        </Button>
        <Button
          onClick={(e) => {
            e.preventDefault()
            handleSaveAsVirtualModel({ name: virtualModelName })
            .then(() => {
              onOpenChange(false)
              handleReset()
            })
          }}
          disabled={isSaving || !virtualModelName.trim()}
        >
          {isSaving
            ? (modified_mode === 'edit' ? 'Updating...' : 'Creating...')
            : (modified_mode === 'edit' ? 'Update Virtual Model' : 'Create Virtual Model')}
        </Button>
      </DialogFooter>
    </>
  );
}
