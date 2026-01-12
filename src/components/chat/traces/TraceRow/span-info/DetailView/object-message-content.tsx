import { JsonViewer } from "../JsonViewer";
import { TextMessageContent } from "./text-message-content";

interface ObjectMessageContentProps {
    objectContent: any;
}

export const ObjectMessageContent = ({ objectContent }: ObjectMessageContentProps) => {
    const isArray = Array.isArray(objectContent);

    if (isArray) {
        if (objectContent.length === 0) {
            return (
                <div className="flex items-center gap-2 py-2 px-3 rounded-lg bg-zinc-800/30 border border-zinc-700/50 text-zinc-500 text-xs">
                    <span className="font-mono">[]</span>
                    <span className="text-zinc-600">Empty array</span>
                </div>
            );
        }
        return (
            <div className="flex flex-col gap-2 text-zinc-400 max-w-full overflow-hidden">
                {objectContent.map((item: any, index: number) => {
                    if (item.type === 'text' && item.text) {
                        return (
                            <TextMessageContent
                                key={`${index}_text`}
                                text={item.text}
                                cache_control={item.cache_control}
                            />
                        );
                    }
                    return (
                        <div
                            key={`${index}_${item.type}`}
                            className="max-w-full whitespace-pre-wrap my-0 overflow-x-auto flex flex-col items-start gap-2 py-2 rounded-lg transition-all duration-200 bg-zinc-800/30 border border-zinc-700/50 px-2"
                        >
                            <JsonViewer data={item} collapseStringsAfterLength={10} />
                        </div>
                    );
                })}
            </div>
        );
    }

    return typeof objectContent === 'string' ? (
        <TextMessageContent text={objectContent} />
    ) : (
        <div className="max-w-full whitespace-pre-wrap my-0 overflow-x-auto flex flex-col items-start gap-2 py-2 rounded-lg transition-all duration-200 bg-zinc-800/30 border border-zinc-700/50 px-2">
            <JsonViewer data={objectContent} />
        </div>
    );
};
