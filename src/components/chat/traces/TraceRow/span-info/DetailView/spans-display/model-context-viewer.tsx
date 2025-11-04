import { LocalModelsConsumer } from "@/contexts/LocalModelsContext";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

interface ModelContextViewerProps {
    model_name: string;
    usage_tokens: number;
    expandMode?: boolean;
}

// Helper function for number formatting
const formatNumber = (num: number) => {
    return new Intl.NumberFormat().format(num);
};

export const ModelContextViewer = ({ model_name, usage_tokens, expandMode }: ModelContextViewerProps) => {
    const { models } = LocalModelsConsumer()
    const model_name_only = model_name.includes('/') ? model_name.split('/')[1] : model_name;
    const model = models.find((model) => model.model === model_name_only);
    const max_context_size = model?.limits?.max_context_size;
    const used_percent = (max_context_size && usage_tokens > 0) ? usage_tokens / max_context_size : 0;
    if (!model || !usage_tokens || !max_context_size || max_context_size <= 0 || usage_tokens <= 0) {
        return (<></>)
    }

    const percentage = used_percent * 100;
    const displayPercentage = percentage > 0 && percentage < 1 ? '<1' : Math.round(percentage);

    const size = 15;
    const strokeWidth = 3;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (used_percent * circumference);

    // Color based on usage level
    const getColor = (percent: number) => {
        if (percent >= 90) return '#ef4444'; // red
        if (percent >= 75) return '#f59e0b'; // amber
        if (percent >= 50) return '#eab308'; // yellow
        return '#10b981'; // green
    };

    const color = getColor(percentage);
    const remainingTokens = max_context_size - usage_tokens;

    const circleIcon = (
        <svg width={size} height={size} className="transform -rotate-90">
            {/* Background circle */}
            <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth={strokeWidth}
                className="opacity-20"
            />
            {/* Progress circle */}
            <circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                strokeLinecap="round"
            />
        </svg>
    );

    const detailsContent = (
        <div className="space-y-2 text-xs min-w-[200px]">
            <div className="flex flex-row justify-between">
            <p className="font-semibold text-sm">Context Usage</p>
            {expandMode && (
                <div className="flex items-center gap-1.5 cursor-help">
                        {circleIcon}
                        <span className="text-xs font-medium" style={{ color }}>
                            {displayPercentage}%
                        </span>
                    </div>
                )}
            </div>
            <div className="space-y-1.5">
                
                <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Used tokens:</span>
                    <span className="font-mono font-medium">{formatNumber(usage_tokens)}</span>
                </div>
                <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Max context:</span>
                    <span className="font-mono font-medium">{formatNumber(max_context_size)}</span>
                </div>
                
                <div className="border-t border-border pt-1.5 flex justify-between gap-4">
                    <span className="text-muted-foreground">Usage:</span>
                    <span className="font-bold" style={{ color }}>
                        {displayPercentage}%
                    </span>
                </div>
            </div>
        </div>
    );

    // Expand mode: show all details inline
    if (expandMode) {
        return (
            <div className="flex flex-col gap-3">
                {detailsContent}
            </div>
        );
    }

    // Default mode: show details in tooltip on hover
    return (
        <TooltipProvider>
            <Tooltip>
                <TooltipTrigger asChild>
                    <div className="flex items-center gap-1.5 cursor-help">
                        {circleIcon}
                        <span className="text-xs font-medium" style={{ color }}>
                            {displayPercentage}%
                        </span>
                    </div>
                </TooltipTrigger>
                <TooltipContent>
                    {detailsContent}
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
};
