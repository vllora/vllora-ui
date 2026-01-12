import { Copy, Check } from "lucide-react";

export type ViewMode = 'ui' | 'raw';

interface ViewModeToggleProps {
    viewMode: ViewMode;
    onViewModeChange: (mode: ViewMode) => void;
    onCopy: () => void;
    copied: boolean;
}

export const ViewModeToggle = ({ viewMode, onViewModeChange, onCopy, copied }: ViewModeToggleProps) => {
    return (
        <div className="flex items-center justify-end gap-2">
            <div className="flex items-center gap-1 bg-[#21262d] rounded-md p-0.5">
                <button
                    onClick={() => onViewModeChange('ui')}
                    className={`px-2 py-1 text-xs rounded transition-colors ${viewMode === 'ui'
                            ? 'bg-[#30363d] text-zinc-200'
                            : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                >
                    UI
                </button>
                <button
                    onClick={() => onViewModeChange('raw')}
                    className={`px-2 py-1 text-xs rounded transition-colors ${viewMode === 'raw'
                            ? 'bg-[#30363d] text-zinc-200'
                            : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                >
                    Raw
                </button>
            </div>
            <button
                onClick={onCopy}
                className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-zinc-400 hover:text-zinc-300  hover:bg-zinc-700 rounded transition-colors"
            >
                {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
            </button>
        </div>
    );
};
