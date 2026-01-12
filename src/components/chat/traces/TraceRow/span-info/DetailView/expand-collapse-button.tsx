import { ChevronDown, ChevronUp } from "lucide-react";

interface ExpandCollapseButtonProps {
    isExpanded: boolean;
    onClick: () => void;
}

export const ExpandCollapseButton = ({ isExpanded, onClick }: ExpandCollapseButtonProps) => (
    <button
        onClick={onClick}
        className="mt-2 inline-flex items-center gap-1 text-[10px] text-zinc-400 transition-colors hover:text-white"
    >
        {isExpanded ? (
            <>
                <ChevronUp className="h-3 w-3" />
                <span className="text-[10px]"> Show less</span>
            </>
        ) : (
            <>
                <ChevronDown className="h-3 w-3" />
                <span className="text-[10px]"> Read more</span>
            </>
        )}
    </button>
);
