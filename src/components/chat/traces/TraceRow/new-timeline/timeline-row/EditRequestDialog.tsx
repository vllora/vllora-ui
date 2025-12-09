import { Pencil, Play } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { JsonEditor } from "@/components/chat/conversation/model-config/json-editor";

interface EditRequestDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    value: string;
    onChange: (value: string) => void;
    onContinue: () => void;
}

export function EditRequestDialog({
    open,
    onOpenChange,
    value,
    onChange,
    onContinue,
}: EditRequestDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[80vh] p-0 gap-0" onClick={(e) => e.stopPropagation()}>
                <div className="p-4 space-y-4">
                    {/* Header */}
                    <div className="flex items-center gap-2 text-yellow-500 font-medium text-sm">
                        <Pencil className="w-4 h-4" />
                        <span>Edit Request</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Modify the request JSON and continue execution
                    </p>

                    {/* JSON Editor */}
                    <div className="h-[400px]">
                        <JsonEditor
                            value={value}
                            onChange={onChange}
                        />
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2 pt-2">
                        <Button
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            onClick={() => onOpenChange(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            className="flex-1 gap-1.5 text-green-500 border-green-500/50 hover:bg-green-500/10 hover:text-green-400"
                            onClick={onContinue}
                        >
                            <Play className="w-3.5 h-3.5" />
                            Continue
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
