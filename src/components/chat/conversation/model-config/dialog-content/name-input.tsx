import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";


export const VirtualModelNameInput = ({virtualModelName, setVirtualModelName}: {virtualModelName: string, setVirtualModelName: (name: string) => void}) => {
    return (
        <div className="space-y-2 py-4">
            <Label htmlFor="virtual-model-name" className="text-sm font-semibold">
                Name <span className="text-red-500">*</span>
            </Label>
            <Input
                id="virtual-model-name"
                placeholder="Enter a name for this virtual model"
                value={virtualModelName}
                onChange={(e) => setVirtualModelName(e.target.value)}
                className="mt-2"
            />
        </div>
    );
}