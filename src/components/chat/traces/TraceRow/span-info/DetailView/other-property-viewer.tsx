import { JsonViewer } from "../JsonViewer";


export const OtherPropertyViewer = ({ attributes, label }: { attributes: any, label?: string }) => {
    return (
        <div className="relative flex flex-col gap-4 rounded-lg border border-border/40 bg-zinc-50/30 p-4 pt-6 dark:bg-zinc-900/20">
            <div className="absolute -top-[10px] left-0 right-0 flex justify-center items-center gap-2">
                <span className="px-2 rounded bg-border text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                    {label || "Other Properties"}
                </span>
            </div>
            <div className="flex flex-col gap-6 overflow-y-auto text-xs">
                <JsonViewer data={attributes} />
            </div>
        </div>
    );
}