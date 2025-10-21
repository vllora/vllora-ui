import { Thread } from "@/types/chat";
import { ThreadsConsumer } from "@/contexts/ThreadsContext";
import { CurrencyDollarIcon, PencilIcon, TrashIcon } from "@heroicons/react/24/outline";
import React, { useCallback, useRef, useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Input } from "../../ui/input";
import { ThreadCopiableId } from "./ThreadCopiableId";
import { cn } from "@/lib/utils";
import { useClickAway } from "ahooks";
import { Card } from "../../ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../ui/tooltip";
import { motion } from "framer-motion";
import { ThreadTimeDisplay } from './ThreadTimeDisplay';
import { ListProviders } from "./ListProviders";
import { formatCost } from "@/utils/formatCost";

export const ThreadRow = React.memo(({ thread }: { thread: Thread }) => {
    const { renameThread, deleteDraftThread, selectedThreadId, threadsHaveChanges, handleThreadClick } = ThreadsConsumer();
    const [isEditing, setIsEditing] = useState(false);
    const [newTitle, setNewTitle] = useState(thread.title);
    const [searchParams] = useSearchParams();
    const urlThreadId = searchParams?.get('threadId');

    const currentThreadChanges = useMemo(() => threadsHaveChanges[thread.id], [thread.id, threadsHaveChanges]);
    // Use URL parameter for immediate feedback, fallback to context only if URL param is null
    const isSelected = urlThreadId ? urlThreadId === thread.id : selectedThreadId === thread.id;

    

    // Extract provider info from input_models
    const providersInfo = useMemo(() => {
        const inputModels = thread.input_models || [];
        const providersMap: { provider: string, models: string[] }[] = [];

        inputModels.forEach(modelFullName => {
            if (modelFullName && modelFullName.includes('/')) {
                const [provider, model] = modelFullName.split('/');
                const existingProviderIndex = providersMap.findIndex(p => p.provider === provider);
                if (existingProviderIndex !== -1) {
                    providersMap[existingProviderIndex].models.push(model);
                } else {
                    providersMap.push({ provider: provider, models: [model] });
                }
            }
        });

        return providersMap;
    }, [thread.input_models]);



    const handleTitleEdit = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setNewTitle(thread.title);
        setIsEditing(true);
    }, [thread.title]);

    const handleTitleSave = useCallback(() => {
        if (newTitle?.trim()) {
            renameThread(thread.id, newTitle.trim());
        }
        setNewTitle(undefined);
        setIsEditing(false);
    }, [newTitle, renameThread, thread.id]);

    const handleDelete = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        deleteDraftThread(thread.id);
    }, [deleteDraftThread, thread.id]);

    const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        e.stopPropagation();
        e.preventDefault();
        setNewTitle(e.target.value);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            setIsEditing(false);
            handleTitleSave();
        }
    };
    const inputRef = useRef<HTMLInputElement>(null);
    useClickAway(() => {
        if (inputRef && inputRef.current && isEditing) {
            setIsEditing(false);
            handleTitleSave();
        }
    }, [inputRef]);

    // No need to calculate model count as we're not displaying it

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
        >
            <Card
                id={`thread-row-${thread.id}`}
                key={thread.id}
                onClick={(e) => {
                    e.stopPropagation();
                    handleThreadClick(thread.id, thread.input_models);
                }}
                className={cn(
                    "py-3 px-4 transition-all duration-200 flex flex-col gap-2 cursor-pointer rounded-md border border-[#161616] border-r-4 active:bg-sidebar-accent/40",
                    isSelected ? '!border-r-4 !border-r-[rgb(var(--theme-500))] bg-secondary shadow-sm' :
                        '!border-r !border-r-[#161616] bg-[#161616] hover:bg-sidebar-accent/50'
                )}
            >
                {/* Header row with title and metadata */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        {/* Provider Icons */}
                        {providersInfo.length > 0 && (
                            <div className="mr-2">
                                <ListProviders providersInfo={providersInfo} />
                            </div>
                        )}

                        {/* Thread title */}
                        {isEditing ? (
                            <Input
                                ref={inputRef}
                                autoFocus
                                value={newTitle}
                                onChange={handleTitleChange}
                                onKeyDown={handleKeyDown}
                                onClick={(e) => e.stopPropagation()}
                                placeholder="Summarize this thread..."
                                className="text-xs px-2 h-[32px] w-full placeholder:text-xs focus:ring-1 focus:ring-[rgb(var(--theme-500))]"
                            />
                        ) : (
                            <div className="flex items-center group gap-2">
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <span className={cn(
                                                "text-sm max-w-[140px] truncate font-medium",
                                                isSelected ? 'text-white' : 'text-foreground'
                                            )}>
                                                {thread.title || 'Untitled'}
                                            </span>
                                        </TooltipTrigger>
                                        <TooltipContent side="top">
                                            {thread.title || 'Untitled'}
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                                <button
                                    onClick={handleTitleEdit}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-[rgb(var(--theme-500))] focus:outline-none focus:text-[rgb(var(--theme-500))]"
                                >
                                    <PencilIcon className="w-3.5 h-3.5" />
                                </button>
                                {thread.is_from_local && (
                                    <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 font-medium">
                                        Draft
                                    </span>
                                )}

                            </div>
                        )}
                    </div>

                    {/* Right side metadata */}
                    <div className="flex items-center gap-2">
                        {/* Thread ID */}
                        <div className="flex items-center gap-1">
                            <ThreadCopiableId id={thread.id} />
                        </div>
                    </div>
                </div>

                {/* Second row with time and run IDs */}
                <div className="flex justify-between flex-1 items-center">
                    <div className="flex flex-1 items-center gap-2">
                        {/* Time info */}
                        <ThreadTimeDisplay finishTimeUs={thread.finish_time_us} updatedAt={thread.updated_at} />

                        {/* Cost info */}
                        {thread.cost !== undefined && thread.cost > 0 && (
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <div className="flex items-center text-xs text-muted-foreground hover:text-foreground transition-colors hover:cursor-help truncate">
                                            <CurrencyDollarIcon className="w-3.5 h-3.5 mr-1.5 text-teal-500" />
                                            <span className="font-mono tabular-nums">{formatCost(thread.cost)}</span>
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-xs p-1.5">
                                        <div>Total cost: {formatCost(thread.cost, 6)}</div>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        )}

                        {/* Run IDs count */}
                        {thread.run_ids && thread.run_ids.length > 0 && (
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <div className="flex items-center text-xs text-muted-foreground hover:text-foreground transition-colors hover:cursor-help truncate">
                                            <span className="font-mono tabular-nums">{thread.run_ids.length} run{thread.run_ids.length !== 1 ? 's' : ''}</span>
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-xs p-1.5">
                                        <div>Run IDs:</div>
                                        {thread.run_ids.slice(0, 5).map((runId, idx) => (
                                            <div key={idx} className="font-mono">{runId}</div>
                                        ))}
                                        {thread.run_ids.length > 5 && <div>... and {thread.run_ids.length - 5} more</div>}
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        )}
                    </div>
                    {/* Unread indicator */}
                    {currentThreadChanges?.messages?.length > 0 && !isSelected && (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div className="relative flex items-center justify-center w-2 h-2 flex-shrink-0">
                                        <div className="absolute w-2 h-2 rounded-full bg-[rgb(var(--theme-500))] animate-ping opacity-75" />
                                        <div className="relative w-1.5 h-1.5 rounded-full bg-[rgb(var(--theme-500))]" />
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent side="top">
                                    {currentThreadChanges?.messages?.length} new {currentThreadChanges?.messages?.length === 1 ? 'update' : 'updates'}
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    )}
                    {/* Delete button for local threads */}
                    {thread.is_from_local && (
                        <button
                            onClick={handleDelete}
                            className="text-muted-foreground hover:text-red-500 focus:outline-none focus:text-red-500"
                        >
                            <TrashIcon className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            </Card>
        </motion.div>
    );
});
