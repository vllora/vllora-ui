import { ViewerCollapsibleSection } from "./ViewerCollapsibleSection";

export const HeaderViewer = (props: {
    headers: any;
    showAll?: boolean;
    onShowAllChange?: (showAll: boolean) => void;
    collapsed?: boolean;
    onCollapsedChange?: (collapsed: boolean) => void;
}) => {
    const { headers, showAll = false, onShowAllChange, collapsed = false, onCollapsedChange } = props;

    const headersValid = ['x-thread-id', 'x-thread-title', 'x-label', 'x-run-id', 'x-tags']
    const allHeadersKeys = headers ? Object.keys(headers) : [];
    const headersFilteredKeys = headers ? allHeadersKeys.filter((key) => headersValid.includes(key)) : [];

    const displayKeys = showAll ? allHeadersKeys : headersFilteredKeys;

    return (
        <ViewerCollapsibleSection
            title="Headers"
            count={displayKeys.length}
            collapsed={collapsed}
            onCollapsedChange={onCollapsedChange}
        >
            <>
                <div className="space-y-1">
                    {displayKeys.length > 0 ? (
                        displayKeys.map((key: string) => (
                            <div key={key} className="rounded-lg">
                                <div className="flex items-start justify-between gap-3">
                                    <span className="text-xs font-medium text-zinc-100 break-all">
                                        {key}
                                    </span>
                                    <span className="text-xs text-zinc-400 break-all font-mono text-right">
                                        {typeof headers[key] === 'string' ? headers[key] : JSON.stringify(headers[key])}
                                    </span>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="flex items-center justify-center py-4 px-4 rounded-lg bg-zinc-900/50 border border-dashed border-zinc-800">
                            <p className="text-xs text-zinc-500 text-center">
                                {allHeadersKeys.length > 0
                                    ? `No standard headers found. Click "Show All" to view other headers.`
                                    : 'No headers available'
                                }
                            </p>
                        </div>
                    )}
                </div>
                {allHeadersKeys.length > headersFilteredKeys.length && (
                    <div className="flex justify-end pt-1">
                        <button
                            onClick={() => onShowAllChange?.(!showAll)}
                            className="text-[10px] font-medium text-zinc-400 hover:text-[rgb(var(--theme-500))] transition-colors"
                        >
                            {showAll ? 'Show Less' : `Show All (${allHeadersKeys.length})`}
                        </button>
                    </div>
                )}
            </>
        </ViewerCollapsibleSection>
    );
}