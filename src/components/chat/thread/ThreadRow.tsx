import { Thread } from "@/types/chat";
import { ThreadsConsumer } from "@/contexts/ThreadsContext";
import { ProjectsConsumer } from "@/contexts/ProjectContext";
import { ClockIcon, CurrencyDollarIcon, ExclamationTriangleIcon, PencilIcon, TrashIcon } from "@heroicons/react/24/outline";
import { formatDistanceToNow, format } from "date-fns";
import React, { useCallback, useRef, useState, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Input } from "../../ui/input";
import { ListProviders } from "./ListProviders";
import { ThreadCopiableId } from "./ThreadCopiableId";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/utils/format";
import { useClickAway } from "ahooks";
import { ThreadTagsDisplay } from "./ThreadTagsDisplay";
import { Card } from "../../ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../ui/tooltip";
import { motion } from "framer-motion";
import { ErrorTooltip } from "./ErrorTooltip";

export const ThreadRow = React.memo(({ thread, onThreadTitleChange }: { thread: Thread, onThreadTitleChange?: (threadId: string, title: string) => void }) => {
    const { renameThread, deleteDraftThread, selectedThreadId } = ThreadsConsumer();
    const { currentProjectId, isDefaultProject } = ProjectsConsumer();
    const [isEditing, setIsEditing] = useState(false);
    const [newTitle, setNewTitle] = useState(thread.title);
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const urlThreadId = searchParams?.get('threadId');

    // Use URL parameter for immediate feedback, fallback to context only if URL param is null
    const isSelected = urlThreadId ? urlThreadId === thread.id : selectedThreadId === thread.id;

    const handleThreadClick = useCallback(() => {
        let modelParam = '';
        if (thread.request_model_name && thread.request_model_name.startsWith('router/')) {
            modelParam = thread.request_model_name;
        } else {
            if (thread.input_models && thread.input_models.length > 0) {
                modelParam = thread.input_models[thread.input_models.length - 1];
            }
        }
        if (!currentProjectId) return;
        const params = new URLSearchParams(searchParams);
        params.set('threadId', thread.id);
        if (!isDefaultProject(currentProjectId)) {
            params.set('project_id', currentProjectId);
        } else {
            params.delete('project_id');
        }
        if (modelParam) {
            params.set('model', modelParam);
        }
        navigate(`/chat?${params.toString()}`);
    }, [currentProjectId, thread.id, thread.input_models, thread.request_model_name, navigate, searchParams, isDefaultProject]);

    // Memoize expensive calculations
    const { tagsDisplay, providersInfo } = useMemo(() => {
        const inputModels = thread.input_models || [];
        const tags = thread.tags_info || [];
        const tagsDisplay = [...new Set(tags.map(t => t.split(';')).flat())];

        // Simplified: Extract provider from model name (format: provider/model)
        const providersInfo: { provider: string, models: string[] }[] = [];
        const modelsToProcess = inputModels.length > 0 ? inputModels : (thread.model_name ? [thread.model_name] : []);

        modelsToProcess.forEach(modelFullName => {
            if (modelFullName && modelFullName.includes('/')) {
                const [provider, model] = modelFullName.split('/');
                const existingProviderIndex = providersInfo.findIndex(p => p.provider === provider);
                if (existingProviderIndex !== -1) {
                    providersInfo[existingProviderIndex].models.push(model);
                } else {
                    providersInfo.push({ provider: provider, models: [model] });
                }
            }
        });

        return { tagsDisplay, providersInfo };
    }, [thread.input_models, thread.tags_info, thread.model_name]);
    const { haveErrors, formattedStartTime, createdDate } = useMemo(() => {
        const haveErrors = thread.errors && thread.errors.length > 0;

        // Safely parse the date and handle invalid values
        const date = new Date(thread.updated_at);
        const isValidDate = !isNaN(date.getTime());

        const formattedStartTime = isValidDate
            ? formatDistanceToNow(date, { addSuffix: true })
            : 'Unknown time';

        const createdDate = isValidDate ? date : null;

        return { haveErrors, formattedStartTime, createdDate };
    }, [thread.errors, thread.updated_at]);

    const handleTitleEdit = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setNewTitle(thread.title);
        setIsEditing(true);
    }, [thread.title]);

    const handleTitleSave = useCallback(() => {
        if (newTitle?.trim()) {
            renameThread(thread.id, newTitle.trim());
            onThreadTitleChange?.(thread.id, newTitle.trim());
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
                onClick={handleThreadClick}
                className={cn(
                    "py-3 px-4 transition-all duration-200 flex flex-col gap-2 cursor-pointer rounded-md border border-[#161616] border-l-4 border-r-4 active:bg-sidebar-accent/40",
                    isSelected ? '!border-r-4 !border-r-[rgb(var(--theme-500))] bg-secondary shadow-sm' :
                        '!border-r !border-r-[#161616] bg-[#161616] hover:bg-sidebar-accent/50',
                    haveErrors ? '!border-l-4 !border-l-yellow-500' : '!border-l !border-l-[#161616]',
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
                                {thread.is_from_local && (
                                    <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400 font-medium">
                                        Draft
                                    </span>
                                )}
                                <button
                                    onClick={handleTitleEdit}
                                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-[rgb(var(--theme-500))] focus:outline-none focus:text-[rgb(var(--theme-500))]"
                                >
                                    <PencilIcon className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Right side metadata */}
                    <div className="flex items-center gap-2">
                        {/* Error indicator */}
                        {haveErrors && (
                            <ErrorTooltip errors={thread.errors || []} side="top">
                                <div className="flex items-center text-xs text-yellow-500 hover:text-yellow-400 transition-colors hover:cursor-help">
                                    <ExclamationTriangleIcon className="w-3.5 h-3.5 mr-1" />
                                    <span>{thread.errors?.length || 0}</span>
                                </div>
                            </ErrorTooltip>
                        )}

                        {/* Thread ID */}
                        <div className="flex items-center gap-1">
                            <ThreadCopiableId id={thread.id} />
                        </div>
                    </div>
                </div>

                {/* Second row with time, cost and tags */}
                <div className="flex justify-between flex-1 items-center">
                    <div className="flex flex-1 items-center gap-2">
                        {/* Time info */}
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div className="flex items-center text-xs text-muted-foreground hover:text-foreground transition-colors hover:cursor-help truncate">
                                        <ClockIcon className="w-3.5 h-3.5 mr-1.5 text-blue-400" />
                                        <span className="font-mono">{formattedStartTime}</span>
                                    </div>
                                </TooltipTrigger>
                                <TooltipContent side="top" className="text-xs p-1.5">
                                    <div>Updated: {createdDate ? format(createdDate, "yyyy-MM-dd HH:mm:ss") : 'Unknown'}</div>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>

                        {/* Cost info */}
                        {thread.cost !== undefined && (
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <div className="flex items-center text-xs text-muted-foreground hover:text-foreground transition-colors hover:cursor-help truncate">
                                            <CurrencyDollarIcon className="w-3.5 h-3.5 mr-1.5 text-teal-500" />
                                            <span className="font-mono tabular-nums"> {formatMoney(thread.cost)}</span>
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="text-xs p-1.5">
                                        <div>Total cost: {formatMoney(thread.cost, 5)}</div>
                                        {thread.input_tokens && <div>Input tokens: {thread.input_tokens.toLocaleString()}</div>}
                                        {thread.output_tokens && <div>Output tokens: {thread.output_tokens.toLocaleString()}</div>}
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        )}


                    </div>

                    {/* Tags */}
                    {tagsDisplay && tagsDisplay.length > 0 && (
                        <div>
                            <ThreadTagsDisplay tags={tagsDisplay} />
                        </div>
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
