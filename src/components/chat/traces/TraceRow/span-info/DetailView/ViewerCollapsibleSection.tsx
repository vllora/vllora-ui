import { ChevronDown, ChevronRight } from "lucide-react";
import { ReactNode } from "react";

export const ViewerCollapsibleSection = (props: {
    title: string;
    count?: number;
    collapsed?: boolean;
    onCollapsedChange?: (collapsed: boolean) => void;
    icon?: ReactNode;
    children: ReactNode;
    subtitle?: string;
}) => {
    const { title, count, collapsed = false, onCollapsedChange, icon, children, subtitle } = props;

    return (
        <div className="flex flex-col gap-2">
            <button
                onClick={() => onCollapsedChange?.(!collapsed)}
                className="flex items-center gap-2 w-full hover:opacity-80 transition-opacity cursor-pointer"
            >
                <div className="h-px flex-1 bg-border" />
                
                <div className="flex items-center gap-3">
                    {icon}
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                        {title}
                    </div>
                    {subtitle && (
                        <div className="text-[10px] font-medium tracking-wide text-zinc-500">
                            ({subtitle})
                        </div>
                    )}
                </div>
                {count !== undefined && count > 0 && (
                    <span className="text-[10px] font-medium text-zinc-500">
                        ({count})
                    </span>
                )}
                {collapsed ? (
                    <ChevronRight className="w-3 h-3 text-zinc-400" />
                ) : (
                    <ChevronDown className="w-3 h-3 text-zinc-400" />
                )}
                <div className="h-px flex-1 bg-border" />
            </button>
            {!collapsed && children}
        </div>
    );
};
