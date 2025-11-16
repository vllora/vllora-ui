import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VersionSelector } from "../version-selector";
import { ModelConfigDialogConsumer } from "../useModelConfigDialog";


export const VirtualModelNameInput = ({virtualModelName, setVirtualModelName}: {virtualModelName: string, setVirtualModelName: (name: string) => void}) => {
    const { modified_mode } = ModelConfigDialogConsumer();

    return (
        <div className="py-4">
            {modified_mode === 'edit' ? (
                // Edit mode: Name and Version on the same row
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="virtual-model-name" className="text-sm font-semibold">
                            Name <span className="text-red-500">*</span>
                        </Label>
                        <Input
                            id="virtual-model-name"
                            placeholder="Enter a name for this virtual model"
                            value={virtualModelName}
                            onChange={(e) => setVirtualModelName(e.target.value)}
                        />
                    </div>
                    <VersionSelector />
                </div>
            ) : (
                // Create mode: Just name field
                <div className="space-y-2">
                    <Label htmlFor="virtual-model-name" className="text-sm font-semibold">
                        Name <span className="text-red-500">*</span>
                    </Label>
                    <Input
                        id="virtual-model-name"
                        placeholder="Enter a name for this virtual model"
                        value={virtualModelName}
                        onChange={(e) => setVirtualModelName(e.target.value)}
                    />
                </div>
            )}
        </div>
    );
}