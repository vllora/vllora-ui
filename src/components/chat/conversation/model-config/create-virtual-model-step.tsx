import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { ModelConfigDialogHeader } from "./dialog-header";
import { ModelConfigDialogContent } from "./dialog-content";
import { JsonEditor } from "./json-editor";
import { ModelConfigDialogConsumer } from "./useModelConfigDialog";
import { VirtualModelNameInput } from "./dialog-content/name-input";

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
  const { mode, jsonContent, setJsonContent, handleReset, handleSaveAsVirtualModel, virtualModelName, setVirtualModelName, modified_mode, onOpenChange } = ModelConfigDialogConsumer()
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
        <div className="flex-1" />
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
