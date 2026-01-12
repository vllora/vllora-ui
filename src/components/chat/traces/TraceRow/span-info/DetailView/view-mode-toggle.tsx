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
        <div className="flex items-center justify-end gap-3">
            <div className="relative flex items-center bg-zinc-900/80 border border-zinc-700/50 rounded-lg p-0.5 backdrop-blur-sm">
                <div
                    className={`absolute h-[calc(100%-4px)] top-0.5 rounded-md bg-zinc-700/80 transition-all duration-200 ease-out ${viewMode === 'ui' ? 'left-0.5 w-[calc(50%-2px)]' : 'left-[calc(50%+2px)] w-[calc(50%-4px)]'
                        }`}
                />
                <button
                    onClick={() => onViewModeChange('ui')}
                    className={`relative z-10 px-3 py-1 text-xs font-medium rounded-md transition-colors duration-200 ${viewMode === 'ui'
                        ? 'text-white'
                        : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                >
                    UI
                </button>
                <button
                    onClick={() => onViewModeChange('raw')}
                    className={`relative z-10 px-3 py-1 text-xs font-medium rounded-md transition-colors duration-200 ${viewMode === 'raw'
                        ? 'text-white'
                        : 'text-zinc-500 hover:text-zinc-300'
                        }`}
                >
                    Raw
                </button>
            </div>
            <button
                onClick={onCopy}
                className="flex items-center justify-center w-7 h-7 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50 border border-transparent hover:border-zinc-600/50 rounded-lg transition-all duration-200"
                title={copied ? "Copied!" : "Copy to clipboard"}
            >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
        </div>
    );
};
