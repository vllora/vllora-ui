import { forwardRef } from "react";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { ModelConfigDialogHeader } from "./dialog-header";
import { SaveVirtualModelForm, SaveVirtualModelFormRef } from "./save-virtual-model-form";
import { ArrowLeft, Save } from "lucide-react";

interface SaveStepProps {
  onSave: (data: { name: string }) => void;
  onBack: () => void;
  isSaving: boolean;
}

export const SaveStep = forwardRef<SaveVirtualModelFormRef, SaveStepProps>(
  ({ onSave, onBack, isSaving }, ref) => {
    return (
      <>
        <ModelConfigDialogHeader
          title="Save as Virtual Model"
          description="Give your model configuration a name"
          mode="basic"
          onModeChange={() => {}}
          hideToggle
        />

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <SaveVirtualModelForm
            ref={ref}
            onSave={onSave}
            onCancel={onBack}
            isSaving={isSaving}
          />
        </div>

        <DialogFooter className="gap-2 border-t pt-4">
          <Button
            variant="outline"
            onClick={onBack}
            disabled={isSaving}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Configuration
          </Button>
          <div className="flex-1" />
          <Button
            onClick={() => {
              if (ref && 'current' in ref && ref.current) {
                ref.current.submit();
              }
            }}
            disabled={isSaving}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            {isSaving ? "Saving..." : "Save Virtual Model"}
          </Button>
        </DialogFooter>
      </>
    );
  }
);

SaveStep.displayName = "SaveStep";
