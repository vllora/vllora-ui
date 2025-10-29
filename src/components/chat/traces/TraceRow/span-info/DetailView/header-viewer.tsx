export const HeaderViewer = (props: {
    headers: any;
    showAll?: boolean;
    onShowAllChange?: (showAll: boolean) => void;
}) => {
    const { headers, showAll = false, onShowAllChange } = props;

    const headersValid = ['x-thread-id', 'x-thread-title', 'x-label', 'x-run-id', 'x-tags']
    const allHeadersKeys = headers ? Object.keys(headers) : [];
    const headersFilteredKeys = headers ? allHeadersKeys.filter((key) => headersValid.includes(key)) : [];

    const displayKeys = showAll ? allHeadersKeys : headersFilteredKeys;

    if (!headers || allHeadersKeys.length === 0) {
        return null;
    }

    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-border" />
                <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    Headers
                </div>
                <span className="text-[10px] font-medium text-zinc-500">
                    ({displayKeys.length})
                </span>
                <div className="h-px flex-1 bg-border" />
            </div>
            <div className="space-y-1">
                {displayKeys.map((key: string) => (
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
                ))}
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
        </div>
    );
}