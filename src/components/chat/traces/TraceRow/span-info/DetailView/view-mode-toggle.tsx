import { Copy, Check } from "lucide-react";

export type ViewMode = 'ui' | 'raw' | 'code';

interface ViewModeToggleProps {
    viewMode: ViewMode;
    onViewModeChange: (mode: ViewMode) => void;
    onCopy: () => void;
    copied: boolean;
    showCodeOption?: boolean;
}

const getSliderStyle = (viewMode: ViewMode, showCodeOption: boolean): React.CSSProperties => {
    const buttonCount = showCodeOption ? 3 : 2;
    const width = `calc(${100 / buttonCount}% - 2px)`;

    let index = 0;
    if (viewMode === 'raw') index = 1;
    if (viewMode === 'code') index = 2;

    const left = index === 0 ? '2px' : `calc(${(100 / buttonCount) * index}% + 1px)`;

    return { width, left };
};

export const ViewModeToggle = ({ viewMode, onViewModeChange, onCopy, copied, showCodeOption = false }: ViewModeToggleProps) => {
    const buttonBaseClass = "relative z-10 flex-1 px-4 py-1.5 text-center text-xs font-medium rounded-md transition-colors duration-200";

    return (
        <div className="flex items-center justify-end gap-3">
            <div className="relative flex items-center bg-zinc-900/80 border border-zinc-700/50 rounded-lg p-0.5 backdrop-blur-sm">
                <div
                    className="absolute h-[calc(100%-4px)] top-0.5 rounded-md bg-zinc-700/80 transition-all duration-200 ease-out"
                    style={getSliderStyle(viewMode, showCodeOption)}
                />
                <button
                    onClick={() => onViewModeChange('ui')}
                    className={`${buttonBaseClass} ${viewMode === 'ui' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                    UI
                </button>
                <button
                    onClick={() => onViewModeChange('raw')}
                    className={`${buttonBaseClass} ${viewMode === 'raw' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                    Raw
                </button>
                {showCodeOption && (
                    <button
                        onClick={() => onViewModeChange('code')}
                        className={`${buttonBaseClass} ${viewMode === 'code' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                        Code
                    </button>
                )}
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
