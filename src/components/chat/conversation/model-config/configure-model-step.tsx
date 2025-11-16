import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { ModelConfigDialogHeader } from "./dialog-header";
import { ModelConfigDialogContent } from "./dialog-content";
import { JsonEditor } from "./json-editor";
import { BookmarkPlus } from "lucide-react";
import { ModelConfigDialogConsumer } from "./useModelConfigDialog";

interface ConfigureModelStepProps {
  title?: string;
  description?: string;
}

export function ConfigureModelStep({
  title = "Model Configuration",
  description = "Fine-tune parameters, caching, fallbacks, and retries for optimal performance",
}: ConfigureModelStepProps) {
  const { mode, setStep, handleReset, handleDoneBtn, jsonContent, setJsonContent } = ModelConfigDialogConsumer();
  return (
    <>
      <ModelConfigDialogHeader
        title={title}
        description={description}
      />

      {/* Configuration Content */}
      {mode === 'basic' ? (
        <ModelConfigDialogContent/>
      ) : (
        <div className="flex-1 overflow-hidden px-6 py-4">
          <JsonEditor
            value={jsonContent}
            onChange={setJsonContent}
          />
        </div>
      )}

      {/* Footer */}
      <DialogFooter className="gap-2 border-t pt-4">
        <Button
          variant="outline"
          onClick={(e) => {
            e.preventDefault();
            setStep('save');
          }}
          className="gap-2"
        >
          <BookmarkPlus className="h-4 w-4" />
          Save as Virtual Model
        </Button>
        <div className="flex-1" />
        <Button variant="outline" onClick={(e) => {
          e.preventDefault();
          handleReset();
        }}>
          Reset to Defaults
        </Button>
        <Button onClick={(e) => {
          e.preventDefault();
          handleDoneBtn();
        }}>
          Done
        </Button>
      </DialogFooter>
    </>
  );
}
