
export const HeaderViewer = (props: { headers: any }) => {
    const { headers } = props;

    const headersValid = ['x-thread-id', 'x-thread-title', 'x-label', 'x-run-id', 'x-tags']
    const headersFilteredKeys = headers ? Object.keys(headers).filter((key) => headersValid.includes(key)) : [];

    if (!headers || headersFilteredKeys.length === 0) {
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
                    ({headersFilteredKeys.length})
                </span>
                <div className="h-px flex-1 bg-border" />
            </div>
            <div className="space-y-1">
                {headersFilteredKeys.map((key: string) => (
                    <div key={key} className="rounded-lg px-3 py-2">
                        <div className="flex items-start justify-between gap-3">
                            <span className="text-xs font-medium text-zinc-100 break-all">
                                {key}
                            </span>
                            <span className="text-xs text-zinc-400 break-all font-mono">
                                {typeof headers[key] === 'string' ? headers[key] : JSON.stringify(headers[key])}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}