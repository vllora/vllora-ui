import { Play, Pencil, PauseCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { JsonViewer } from "../../span-info/JsonViewer";

interface BreakpointTooltipContentProps {
    request: unknown;
    onContinue: (e: React.MouseEvent) => void;
    onEditAndContinue: (e: React.MouseEvent) => void;
}

export const BreakpointTooltipContent = ({
    request,
    onContinue,
    onEditAndContinue,
}: BreakpointTooltipContentProps) => {
    return (
        <div className="p-3 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 text-yellow-500 font-medium text-sm">
                <PauseCircle className="w-4 h-4" />
                <span>Breakpoint - Paused</span>
            </div>

            {/* Request Preview */}
            <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Request:</div>
                <div className="max-h-[200px] overflow-auto  rounded p-2">
                    {request ? (
                        <JsonViewer
                            data={request}
                            collapsed={10}
                            collapseStringsAfterLength={100}
                        />
                    ) : (
                        <span className="text-xs text-muted-foreground">No request data</span>
                    )}
                </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 pt-1">
                <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 gap-1.5 text-green-500 border-green-500/50 hover:bg-green-500/10 hover:text-green-400"
                    onClick={onContinue}
                >
                    <Play className="w-3.5 h-3.5" />
                    Continue
                </Button>
                <Button
                    size="sm"
                    variant="outline"
                    className="flex-1 gap-1.5 text-blue-500 border-blue-500/50 hover:bg-blue-500/10 hover:text-blue-400"
                    onClick={onEditAndContinue}
                >
                    <Pencil className="w-3.5 h-3.5" />
                    Edit
                </Button>
            </div>
        </div>
    );
};
