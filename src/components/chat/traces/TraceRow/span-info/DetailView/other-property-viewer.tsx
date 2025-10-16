import { JsonViewer } from "../JsonViewer";


export const OtherPropertyViewer = ({ attributes }: { attributes: any }) => {
    return (
        <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-border/40" />
                <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                    Other Properties
                </div>
                <div className="h-px flex-1 bg-border/40" />
            </div>
            <JsonViewer data={attributes} />
        </div>
    );
}