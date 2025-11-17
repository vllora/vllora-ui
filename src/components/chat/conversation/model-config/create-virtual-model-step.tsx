import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { ModelConfigDialogHeader } from "./dialog-header";
import { ModelConfigDialogContent } from "./dialog-content";
import { JsonEditor } from "./json-editor";
import { ModelConfigDialogConsumer } from "./useModelConfigDialog";
import { VirtualModelNameInput } from "./dialog-content/name-input";
import { VirtualModelsConsumer } from "@/contexts/VirtualModelsContext";
import { VirtualModel } from "@/services/virtual-models-api";
import { Info } from "lucide-react";
import { AlertDescription } from "@/components/ui/alert";

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
  const isCurrentVersionPublished = !!currentVersion?.published_at;

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

  const handlePublishVersion = async () => {
    if (!virtualModel || selectedVersion === undefined) return;

    try {
      await updateVersionMeta({
        virtualModelId: virtualModel.id,
        version: selectedVersion,
        is_published: true,
      });
    } catch (error) {
      console.error("Error publishing version:", error);
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
        <div className="flex-1 flex flex-col gap-2">
          {/* Info message when editing published version */}
          {modified_mode === 'edit' && isCurrentVersionPublished && (
            <div className="py-2 flex items-center gap-2">
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                This version is published and cannot be modified. Saving will create a new version.
              </AlertDescription>
            </div>
          )}
          {/* Action buttons for unpublished versions */}
          {modified_mode === 'edit' && selectedVersion !== undefined && !isCurrentVersionPublished && (
            <div className="flex gap-2">
              {/* Publish Version Button */}
              <Button
                variant="outline"
                onClick={handlePublishVersion}
                disabled={updatingVersionMeta}
              >
                {updatingVersionMeta ? 'Publishing...' : 'Publish Version'}
              </Button>
              {/* Mark as Latest Button - Only show when not already latest */}
              {!isCurrentVersionLatest && (
                <Button
                  variant="outline"
                  onClick={handleMarkAsLatest}
                  disabled={updatingVersionMeta}
                >
                  {updatingVersionMeta ? 'Marking...' : 'Mark as Latest & Publish'}
                </Button>
              )}
            </div>
          )}
        </div>
        <Button variant="outline" onClick={handleReset}>
          Reset to Defaults
        </Button>
        <Button
          onClick={(e) => {
            e.preventDefault()
            handleSaveAsVirtualModel({
              name: virtualModelName,
              forceCreateNewVersion: isCurrentVersionPublished
            })
            .then(() => {
              onOpenChange(false)
              handleReset()
            })
          }}
          disabled={isSaving || !virtualModelName.trim()}
        >
          {isSaving
            ? (modified_mode === 'edit' && isCurrentVersionPublished ? 'Creating New Version...' : modified_mode === 'edit' ? 'Updating...' : 'Creating...')
            : (modified_mode === 'edit' && isCurrentVersionPublished ? 'Create New Version' : modified_mode === 'edit' ? 'Update Virtual Model' : 'Create Virtual Model')}
        </Button>
      </DialogFooter>
    </>
  );
}
