import { cn } from "@/lib/utils";

interface StatusBadgeProps {
    status: string | number;
}

export const StatusBadge = ({ status }: StatusBadgeProps) => {
    const isSuccess = ['200', 200].includes(status);

    return (
        <div className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-medium uppercase tracking-wider border",
            isSuccess
                ? "bg-[#0d1f0d] text-green-500 border-green-900/50"
                : "bg-[#1f0d0d] text-red-500 border-red-900/50"
        )}>
            {isSuccess ? 'Success' : 'Failed'}
        </div>
    );
};
