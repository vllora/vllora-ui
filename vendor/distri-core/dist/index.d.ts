import { MessageSendParams, Message, Task, Part, AgentSkill, TaskStatusUpdateEvent, TaskArtifactUpdateEvent } from '@a2a-js/sdk/client';
export { AgentCard, Message, MessageSendParams, Task, TaskArtifactUpdateEvent, TaskStatus, TaskStatusUpdateEvent } from '@a2a-js/sdk/client';

type Role = 'user' | 'system' | 'assistant';
interface RunStartedEvent {
    type: 'run_started';
    data: {
        runId?: string;
        taskId?: string;
    };
}
interface RunFinishedEvent {
    type: 'run_finished';
    data: {
        runId?: string;
        taskId?: string;
    };
}
interface RunErrorEvent {
    type: 'run_error';
    data: {
        message: string;
        code?: string;
    };
}
interface PlanStartedEvent {
    type: 'plan_started';
    data: {
        initial_plan?: boolean;
    };
}
interface PlanFinishedEvent {
    type: 'plan_finished';
    data: {
        total_steps?: number;
    };
}
interface PlanPrunedEvent {
    type: 'plan_pruned';
    data: {
        removed_steps?: any;
    };
}
interface TextMessageStartEvent {
    type: 'text_message_start';
    data: {
        message_id: string;
        step_id: string;
        role: Role;
        is_final?: boolean;
    };
}
interface TextMessageContentEvent {
    type: 'text_message_content';
    data: {
        message_id: string;
        step_id: string;
        delta: string;
    };
}
interface TextMessageEndEvent {
    type: 'text_message_end';
    data: {
        message_id: string;
        step_id: string;
    };
}
interface ToolExecutionStartEvent {
    type: 'tool_execution_start';
    data: {
        tool_call_id: string;
        tool_call_name: string;
        parent_message_id?: string;
        input?: any;
    };
}
interface ToolExecutionEndEvent {
    type: 'tool_execution_end';
    data: {
        tool_call_id: string;
    };
}
interface ToolRejectedEvent {
    type: 'tool_rejected';
    data: {
        reason?: string;
        tool_call_id?: string;
    };
}
interface AgentHandoverEvent {
    type: 'agent_handover';
    data: {
        from_agent: string;
        to_agent: string;
        reason?: string;
    };
}
interface StepStartedEvent {
    type: 'step_started';
    data: {
        step_id: string;
        step_title: string;
        step_index: number;
    };
}
interface StepCompletedEvent {
    type: 'step_completed';
    data: {
        step_id: string;
        step_title: string;
        step_index: number;
    };
}
interface FeedbackReceivedEvent {
    type: 'feedback_received';
    data: {
        feedback: string;
    };
}
interface ToolCallsEvent {
    type: 'tool_calls';
    data: {
        tool_calls: Array<{
            tool_call_id: string;
            tool_name: string;
            input: any;
        }>;
    };
}
interface ToolResultsEvent {
    type: 'tool_results';
    data: {
        results: Array<ToolResult>;
    };
}
interface BrowserScreenshotEvent {
    type: 'browser_screenshot';
    data: {
        image: string;
        format?: string;
        filename?: string;
        size?: number;
        timestamp_ms?: number;
    };
}
interface BrowserSessionStartedEvent {
    type: 'browser_session_started';
    data: {
        session_id: string;
        viewer_url?: string;
        stream_url?: string;
    };
}
interface InlineHookRequestedEvent {
    type: 'inline_hook_requested';
    data: {
        hook_id: string;
        hook: string;
        context: {
            agent_id: string;
            thread_id: string;
            task_id: string;
            run_id: string;
        };
        timeout_ms?: number;
        fire_and_forget?: boolean;
        message?: any;
        plan?: any;
        result?: any;
    };
}
type TodoStatus = 'open' | 'in_progress' | 'done';
interface TodoItem {
    id: string;
    content: string;
    status: TodoStatus;
}
interface TodosUpdatedEvent {
    type: 'todos_updated';
    data: {
        formatted_todos: string;
        action: string;
        todo_count: number;
        /** Parsed todo items for rendering */
        todos?: TodoItem[];
    };
}
type DistriEvent = RunStartedEvent | RunFinishedEvent | RunErrorEvent | PlanStartedEvent | PlanFinishedEvent | PlanPrunedEvent | TextMessageStartEvent | TextMessageContentEvent | TextMessageEndEvent | ToolExecutionStartEvent | ToolExecutionEndEvent | ToolRejectedEvent | StepStartedEvent | StepCompletedEvent | AgentHandoverEvent | FeedbackReceivedEvent | ToolCallsEvent | ToolResultsEvent | BrowserScreenshotEvent | BrowserSessionStartedEvent | InlineHookRequestedEvent | TodosUpdatedEvent;

type ChatCompletionRole = 'system' | 'user' | 'assistant' | 'tool';
interface ChatCompletionMessage {
    role: ChatCompletionRole;
    content: string;
}
type ChatCompletionResponseFormat = {
    type: 'text';
} | {
    type: 'json_schema';
    json_schema: {
        name: string;
        schema: Record<string, unknown>;
        strict?: boolean;
    };
};
interface ChatCompletionRequest {
    model?: string;
    messages: ChatCompletionMessage[];
    temperature?: number;
    max_tokens?: number;
    response_format?: ChatCompletionResponseFormat;
    tools?: unknown[];
    tool_choice?: 'none' | 'auto' | Record<string, unknown>;
}
interface ChatCompletionChoice {
    index: number;
    finish_reason?: string | null;
    message: ChatCompletionMessage;
}
interface ChatCompletionResponse {
    id: string;
    created: number;
    model: string;
    object: string;
    choices: ChatCompletionChoice[];
    usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
    };
}
/**
 * Enhanced Distri Client that wraps A2AClient and adds Distri-specific features
 *
 * @example
 * // Local development
 * const client = new DistriClient({ baseUrl: 'http://localhost:3033' });
 *
 * // Cloud with default URL (https://api.distri.dev)
 * const client = DistriClient.create();
 */
declare class DistriClient {
    private config;
    private accessToken?;
    private refreshToken?;
    private tokenRefreshSkewMs;
    private onTokenRefresh?;
    private refreshPromise?;
    private agentClients;
    constructor(config: DistriClientConfig);
    /**
     * Get the configured client ID.
     */
    get clientId(): string | undefined;
    /**
     * Set the client ID for embed token issuance.
     */
    set clientId(value: string | undefined);
    /**
     * Get the configured workspace ID.
     */
    get workspaceId(): string | undefined;
    /**
     * Set the workspace ID for multi-tenant support.
     * Updates the X-Workspace-Id header for all subsequent requests.
     */
    set workspaceId(value: string | undefined);
    /**
     * Create a client with default cloud configuration.
     *
     * @param overrides - Optional overrides for the default config
     */
    static create(overrides?: Partial<DistriClientConfig>): DistriClient;
    /**
     * Check if this client has authentication configured.
     */
    hasAuth(): boolean;
    /**
     * Check if this client is configured for local development.
     */
    isLocal(): boolean;
    /**
     * Session store: set a value (optionally with expiry)
     */
    setSessionValue(sessionId: string, key: string, value: unknown, expiry?: Date | string): Promise<void>;
    /**
     * Session store: get a single value
     */
    getSessionValue<T = unknown>(sessionId: string, key: string): Promise<T | null>;
    /**
     * Session store: get all values in a session
     */
    getSessionValues(sessionId: string): Promise<Record<string, unknown>>;
    /**
     * Session store: delete a single key
     */
    deleteSessionValue(sessionId: string, key: string): Promise<void>;
    /**
     * Session store: clear all keys in a session
     */
    clearSession(sessionId: string): Promise<void>;
    /**
     * Response from the token endpoint
     */
    static readonly TokenType: {
        readonly Main: "main";
        readonly Short: "short";
    };
    /**
     * Issue an access token + refresh token for temporary authentication.
     * Requires an existing authenticated session (bearer token).
     *
     * @returns Token response with access/refresh token strings
     * @throws ApiError if not authenticated or token issuance fails
     *
     * @example
     * ```typescript
     * const { access_token, refresh_token } = await client.issueToken();
     * // Persist the refresh token and use access_token for requests
     * ```
     */
    issueToken(): Promise<{
        access_token: string;
        refresh_token: string;
        expires_at: number;
    }>;
    /**
     * Get the current access/refresh tokens.
     */
    getTokens(): {
        accessToken?: string;
        refreshToken?: string;
    };
    /**
     * Update the access/refresh tokens in memory.
     */
    setTokens(tokens: {
        accessToken?: string;
        refreshToken?: string;
    }): void;
    /**
     * Reset all authentication tokens.
     */
    resetTokens(): void;
    /**
     * Start streaming speech-to-text transcription via WebSocket
     */
    streamingTranscription(options?: StreamingTranscriptionOptions): Promise<{
        sendAudio: (audioData: ArrayBuffer) => void;
        sendText: (text: string) => void;
        stop: () => void;
        close: () => void;
    }>;
    /**
     * Transcribe audio blob to text using speech-to-text API
     */
    transcribe(audioBlob: Blob, config?: SpeechToTextConfig): Promise<string>;
    getConfiguration(): Promise<ConfigurationResponse>;
    updateConfiguration(configuration: DistriConfiguration): Promise<ConfigurationResponse>;
    /**
     * Minimal LLM helper that proxies to the Distri server using Distri messages.
     */
    llm(messages: DistriMessage[], tools?: ToolDefinition[], options?: LlmExecuteOptions): Promise<LLMResponse>;
    /**
     * Get all available agents from the Distri server
     */
    getAgents(): Promise<AgentDefinition[]>;
    /**
     * Get specific agent by ID
     */
    getAgent(agentId: string): Promise<AgentConfigWithTools>;
    /**
     * Update an agent's definition (markdown only)
     */
    updateAgent(agentId: string, update: {
        markdown: string;
    }): Promise<AgentConfigWithTools>;
    /**
     * Get or create A2AClient for an agent
     */
    private getA2AClient;
    /**
     * Send a message to an agent
     */
    sendMessage(agentId: string, params: MessageSendParams): Promise<Message | Task>;
    /**
     * Send a streaming message to an agent
     */
    sendMessageStream(agentId: string, params: MessageSendParams): AsyncGenerator<A2AStreamEventData>;
    /**
     * Extract a user-friendly error message from potentially nested errors
     */
    private extractErrorMessage;
    /**
     * Get task details
     */
    getTask(agentId: string, taskId: string): Promise<Task>;
    /**
     * Cancel a task
     */
    cancelTask(agentId: string, taskId: string): Promise<void>;
    /**
     * Get threads from Distri server with filtering and pagination
     */
    getThreads(params?: ThreadListParams): Promise<ThreadListResponse>;
    /**
     * Get agents sorted by thread count (most active first).
     * Includes all registered agents, even those with 0 threads.
     * Optionally filter by name with search parameter.
     */
    getAgentsByUsage(options?: {
        search?: string;
    }): Promise<AgentUsageInfo[]>;
    /**
     * Create a new browser session
     * Returns session info including viewer_url and stream_url from browsr
     */
    createBrowserSession(): Promise<BrowserSession>;
    getThread(threadId: string): Promise<DistriThread>;
    /**
     * Get thread messages
     */
    getThreadMessages(threadId: string): Promise<Message[]>;
    /**
     * Get messages from a thread as DistriMessage format
     */
    getThreadMessagesAsDistri(threadId: string): Promise<DistriMessage[]>;
    /**
     * Mark a message as read
     */
    markMessageRead(threadId: string, messageId: string): Promise<MessageReadStatus>;
    /**
     * Get read status for a specific message
     */
    getMessageReadStatus(threadId: string, messageId: string): Promise<MessageReadStatus | null>;
    /**
     * Get read status for all messages in a thread
     */
    getThreadReadStatus(threadId: string): Promise<MessageReadStatus[]>;
    /**
     * Vote on a message (upvote or downvote)
     * Downvotes require a comment explaining the issue
     */
    voteMessage(threadId: string, messageId: string, request: VoteMessageRequest): Promise<MessageVote>;
    /**
     * Remove vote from a message
     */
    removeVote(threadId: string, messageId: string): Promise<void>;
    /**
     * Get vote summary for a message (counts + current user's vote)
     */
    getMessageVoteSummary(threadId: string, messageId: string): Promise<MessageVoteSummary>;
    /**
     * Get all votes for a message (admin/analytics use)
     */
    getMessageVotes(threadId: string, messageId: string): Promise<MessageVote[]>;
    /**
     * Send a DistriMessage to a thread
     */
    sendDistriMessage(threadId: string, message: DistriMessage, context: InvokeContext): Promise<void>;
    /**
     * Complete an external tool call
     */
    completeTool(agentId: string, result: ToolResult): Promise<void>;
    /**
     * Complete an inline hook with a mutation payload.
     */
    completeInlineHook(hookId: string, mutation: any): Promise<void>;
    /**
     * Get the base URL for making direct requests
     */
    get baseUrl(): string;
    private applyTokens;
    /**
     * Ensure access token is valid, refreshing if necessary
     */
    private ensureAccessToken;
    private refreshTokens;
    private performTokenRefresh;
    private isTokenExpiring;
    private getTokenExpiry;
    private decodeJwtPayload;
    private decodeBase64Url;
    private applyAuthHeader;
    /**
     * Enhanced fetch with retry logic
     */
    private fetchAbsolute;
    /**
     * Enhanced fetch with retry logic and auth headers.
     * Exposed publicly for extensions like DistriHomeClient.
     */
    fetch(input: RequestInfo | URL, initialInit?: RequestInit): Promise<Response>;
    /**
     * Delay utility
     */
    private delay;
    /**
     * Debug logging
     */
    private debug;
    /**
     * Helper method to create A2A messages
     */
    static initMessage(parts: Part[] | string, role: "agent" | "user" | undefined, message: Omit<Partial<Message>, 'parts' | 'role' | 'kind'>): Message;
    /**
     * Create a DistriMessage instance
     */
    static initDistriMessage(role: DistriMessage['role'], parts: DistriPart[], id?: string, created_at?: number): DistriMessage;
    /**
     * Helper method to create message send parameters.
     *
     * Pass `dynamicMetadata` to inject `dynamic_sections` and/or `dynamic_values`
     * into the metadata so the server can apply them to prompt templates.
     */
    static initMessageParams(message: Message, configuration?: MessageSendParams['configuration'], metadata?: any, dynamicMetadata?: DynamicMetadata): MessageSendParams;
    /**
     * Create MessageSendParams from a DistriMessage using InvokeContext.
     *
     * Pass `dynamicMetadata` to inject `dynamic_sections` and/or `dynamic_values`
     * into the metadata so the server can apply them to prompt templates.
     */
    static initDistriMessageParams(message: DistriMessage, context: InvokeContext, dynamicMetadata?: DynamicMetadata): MessageSendParams;
}
declare function uuidv4(): string;

/**
 * Configuration for Agent invoke method
 */
interface InvokeConfig {
    /** Configuration for the message */
    configuration?: MessageSendParams['configuration'];
    /** Context/thread ID */
    contextId?: string;
    /** Metadata for the requests */
    metadata?: any;
    /** Dynamic prompt sections injected into the template per-call */
    dynamic_sections?: DynamicMetadata['dynamic_sections'];
    /** Dynamic key-value pairs available in templates per-call */
    dynamic_values?: DynamicMetadata['dynamic_values'];
    /** Per-part metadata indexed by part position (0-based).
     *  Use to control which parts are saved to the database.
     *  Parts with `save: false` will be filtered out before saving. */
    parts?: DynamicMetadata['parts'];
}
/**
 * Result from agent invoke
 */
interface InvokeResult {
    /** Final response message */
    message?: Message;
    /** Task if created */
    task?: any;
    /** Whether the response was streamed */
    streamed: boolean;
}
interface ExternalToolValidationResult {
    isValid: boolean;
    requiredTools: string[];
    providedTools: string[];
    missingTools: string[];
    message?: string;
}
declare class ExternalToolValidationError extends DistriError {
    missingTools: string[];
    requiredTools: string[];
    providedTools: string[];
    agentName: string;
    constructor(agentName: string, result: ExternalToolValidationResult);
}
/**
 * Enhanced Agent class with simple tool system following AG-UI pattern
 */
declare class Agent {
    private client;
    private agentDefinition;
    private hookHandlers;
    private defaultHookHandler;
    constructor(agentDefinition: AgentConfigWithTools, client: DistriClient);
    /**
     * Get agent information
     */
    get id(): string;
    get name(): string;
    get description(): string | undefined;
    get agentType(): string | undefined;
    get iconUrl(): string | undefined;
    /**
     * Get the full agent definition (including backend tools)
     */
    getDefinition(): AgentConfigWithTools;
    /**
     * Fetch messages for a thread (public method for useChat)
     */
    getThreadMessages(threadId: string): Promise<Message[]>;
    /**
     * Direct (non-streaming) invoke
     */
    invoke(params: MessageSendParams, tools?: DistriBaseTool[], hooks?: Record<string, HookHandler>): Promise<Message>;
    /**
     * Streaming invoke
     */
    invokeStream(params: MessageSendParams, tools?: DistriBaseTool[], hooks?: Record<string, HookHandler>): Promise<AsyncGenerator<DistriChatMessage>>;
    /**
     * Validate that required external tools are registered before invoking.
     */
    validateExternalTools(tools?: DistriBaseTool[]): ExternalToolValidationResult;
    /**
     * Enhance message params with tool definitions and dynamic metadata.
     *
     * When `dynamic_sections` or `dynamic_values` are present in `params.metadata`,
     * they are forwarded so the server injects them into the prompt template.
     */
    private enhanceParamsWithTools;
    private assertExternalTools;
    private getRequiredExternalTools;
    private resolveToolConfig;
    private extractToolConfig;
    private formatExternalToolValidationMessage;
    /**
     * Register multiple hooks at once.
     */
    registerHooks(hooks: Record<string, HookHandler>, defaultHandler?: HookHandler): void;
    /**
     * Create an agent instance from an agent ID
     */
    static create(agentIdOrDef: string | AgentConfigWithTools, client: DistriClient): Promise<Agent>;
    /**
     * Complete an external tool call by sending the result back to the server
     */
    completeTool(result: ToolResult): Promise<void>;
    /**
     * List all available agents
     */
    static list(client: DistriClient): Promise<Agent[]>;
}

/**
 * Message roles supported by Distri
 */
type MessageRole = 'system' | 'assistant' | 'user' | 'tool' | 'developer';
/**
 * Message metadata structure that matches the backend.
 * The 'parts' field maps part indices to PartMetadata for save filtering.
 */
interface DistriMessageMetadata {
    /** Per-part metadata indexed by part position (0-based). Parts with save: false are filtered before DB save. */
    parts?: Record<number, {
        save?: boolean;
    }>;
    /** Session ID for browser sessions */
    session_id?: string;
    /** Browser session ID */
    browser_session_id?: string;
    /** Model/definition overrides */
    definition_overrides?: {
        model?: string;
    };
    /** Additional arbitrary metadata */
    [key: string]: unknown;
}
/**
 * Distri-specific message structure with parts
 */
interface DistriMessage {
    id: string;
    role: MessageRole;
    parts: DistriPart[];
    created_at: number;
    step_id?: string;
    is_final?: boolean;
    /** The ID of the agent that generated this message (for assistant messages) */
    agent_id?: string;
    /** The name of the agent that generated this message (for assistant messages) */
    agent_name?: string;
    /** Message metadata including parts metadata for save filtering */
    metadata?: DistriMessageMetadata;
}
interface LlmExecuteOptions {
    thread_id?: string;
    parent_task_id?: string;
    run_id?: string;
    model_settings?: any;
    is_sub_task?: boolean;
    headers?: Record<string, string>;
    agent_id?: string;
    external_id?: string;
    load_history?: boolean;
    title?: string;
}
interface AssistantWithToolCalls {
    id: string;
    type: 'llm_response';
    timestamp: number;
    content: string;
    tool_calls: any[];
    step_id?: string;
    success: boolean;
    rejected: boolean;
    is_external: boolean;
    reason: string | null;
}
interface UseToolsOptions {
    agent?: Agent;
    externalTools?: DistriBaseTool[];
    executionOptions?: ToolExecutionOptions;
}
interface ToolExecutionOptions {
    autoExecute?: boolean;
}
interface HookMutation {
    dynamic_values: Record<string, any>;
}
interface HookContext {
    agent_id: string;
    thread_id: string;
    task_id: string;
    run_id: string;
}
interface InlineHookRequest {
    hook_id: string;
    hook: string;
    context: HookContext;
    timeout_ms?: number;
    fire_and_forget?: boolean;
    message?: any;
    plan?: any;
    result?: any;
}
interface InlineHookEventData extends InlineHookRequest {
}
type HookHandler = (req: InlineHookRequest) => Promise<HookMutation> | HookMutation;
interface ToolResults {
    id: string;
    type: 'tool_results';
    timestamp: number;
    results: any[];
    step_id?: string;
    success: boolean;
    rejected: boolean;
    reason: string | null;
}
interface DistriPlan {
    id: string;
    type: 'plan';
    timestamp: number;
    reasoning: string;
    steps: PlanStep[];
}
interface BasePlanStep {
    id: string;
}
interface ThoughtPlanStep extends BasePlanStep {
    type: 'thought';
    message: string;
}
interface ActionPlanStep extends BasePlanStep {
    type: 'action';
    action: PlanAction;
}
interface CodePlanStep extends BasePlanStep {
    type: 'code';
    code: string;
    language: string;
}
interface FinalResultPlanStep extends BasePlanStep {
    type: 'final_result';
    content: string;
    tool_calls: any[];
}
interface PlanAction {
    tool_name?: string;
    input?: string;
    prompt?: string;
    context?: any[];
    tool_calling_config?: any;
}
type PlanStep = ThoughtPlanStep | ActionPlanStep | CodePlanStep | FinalResultPlanStep;
interface LlmPlanStep extends BasePlanStep {
    type: 'llm_call';
    prompt: string;
    context: any[];
}
interface BatchToolCallsStep extends BasePlanStep {
    type: 'batch_tool_calls';
    tool_calls: any[];
}
interface ThoughtStep extends BasePlanStep {
    type: 'thought';
    message: string;
}
interface ReactStep extends BasePlanStep {
    type: 'react_step';
    thought: string;
    action: string;
}
type DistriStreamEvent = DistriMessage | DistriEvent;
/**
 * A named prompt section that can be dynamically injected into templates per-call.
 */
interface PromptSection {
    key: string;
    content: string;
}
/**
 * Metadata for individual message parts.
 * Used to control part behavior such as persistence.
 */
interface PartMetadata {
    /** If false, this part will be filtered out before saving to the database.
     *  Useful for ephemeral/dynamic content that should only be sent in the current turn.
     *  Defaults to true. */
    save?: boolean;
}
/**
 * Dynamic metadata that can be provided per invoke call to customise
 * prompt template rendering on the server.
 */
interface DynamicMetadata {
    /** Dynamic prompt sections injected into the template per-call */
    dynamic_sections?: PromptSection[];
    /** Dynamic key-value pairs available in templates per-call */
    dynamic_values?: Record<string, unknown>;
    /** Per-part metadata indexed by part position (0-based).
     *  Parts not listed will use default metadata (save: true). */
    parts?: Record<number, PartMetadata>;
}
/**
 * Context required for constructing A2A messages from DistriMessage
 */
interface InvokeContext {
    thread_id: string;
    run_id?: string;
    task_id?: string;
    getMetadata?: () => any;
}
/**
 * Distri message parts - equivalent to Rust enum Part
 */
type TextPart = {
    part_type: 'text';
    data: string;
};
type ToolCallPart = {
    part_type: 'tool_call';
    data: ToolCall;
};
type ToolResultRefPart = {
    part_type: 'tool_result';
    data: ToolResult;
};
type ImagePart = {
    part_type: 'image';
    data: FileType;
};
type DataPart = {
    part_type: 'data';
    data: object;
};
type DistriPart = TextPart | ToolCallPart | ToolResultRefPart | ImagePart | DataPart;
/**
 * File type for images - matches Rust FileType::Bytes
 */
interface FileBytes {
    type: 'bytes';
    mime_type: string;
    bytes: string;
    name?: string;
}
interface FileUrl {
    type: 'url';
    mime_type: string;
    url: string;
    name?: string;
}
type FileType = FileBytes | FileUrl;
interface ToolDefinition {
    name: string;
    description: string;
    parameters: object;
    examples?: string;
    output_schema?: object;
}
/**
 * Tool definition interface following AG-UI pattern
 */
interface DistriBaseTool extends ToolDefinition {
    type: 'function' | 'ui';
    is_final?: boolean;
    autoExecute?: boolean;
    isExternal?: boolean;
}
interface DistriFnTool extends DistriBaseTool {
    type: 'function';
    handler: ToolHandler;
    onToolComplete?: (toolCallId: string, toolResult: ToolResult) => void;
}
/**
 * Tool handler function
 */
interface ToolHandler {
    (input: any): Promise<string | number | boolean | null | DistriPart[] | object>;
}
/**
 * Tool call from agent
 */
interface ToolCall {
    tool_call_id: string;
    tool_name: string;
    input: any;
}
/**
 * Tool result structure that can come from backend or frontend
 */
interface ToolResult {
    readonly tool_call_id: string;
    readonly tool_name: string;
    readonly parts: readonly DistriPart[];
    /** Per-part metadata indexed by part position (0-based). Parts with save: false will be filtered out when storing. */
    readonly parts_metadata?: Record<number, PartMetadata>;
}
/**
 * Tool result data that goes inside the parts array
 */
interface ToolResultData {
    result: string | number | boolean | null | object;
    success: boolean;
    error?: string;
}
declare function isArrayParts(result: any): boolean;
/**
 * Part with optional inline metadata - used by tool handlers to mark parts as non-saveable
 */
type DistriPartWithMetadata = DistriPart & {
    __metadata?: PartMetadata;
};
/**
 * Type-safe helper to create a successful ToolResult
 * Uses proper DistriPart structure - conversion to backend format happens in encoder
 *
 * Parts can include __metadata property to specify part-level metadata (e.g., save: false).
 * Image parts are automatically marked as save: false.
 */
declare function createSuccessfulToolResult(toolCallId: string, toolName: string, result: string | number | boolean | null | object | DistriPartWithMetadata[], explicitPartsMetadata?: Record<number, PartMetadata>): ToolResult;
/**
 * Type-safe helper to create a failed ToolResult
 * Uses proper DistriPart structure - conversion to backend format happens in encoder
 */
declare function createFailedToolResult(toolCallId: string, toolName: string, error: string, result?: string | number | boolean | null | object): ToolResult;
/**
 * Type-safe helper to extract ToolResultData from a ToolResult
 * Handles both frontend DistriPart format and backend BackendPart format
 */
declare function extractToolResultData(toolResult: ToolResult): ToolResultData | null;
interface AgentConfigWithTools extends AgentDefinition {
    markdown?: string;
    resolved_tools?: ToolDefinition[];
}
/**
 * Distri-specific Agent type that wraps A2A AgentCard
 */
interface AgentDefinition {
    /** The name of the agent. */
    name: string;
    id: string;
    /** Optional package identifier (workspace/plugin) that registered the agent */
    package_name?: string | null;
    /** A brief description of the agent's purpose. */
    description?: string;
    /** The version of the agent. */
    version?: string;
    /** The system prompt for the agent, if any. */
    system_prompt?: string | null;
    /** A list of MCP server definitions associated with the agent. */
    mcp_servers?: McpDefinition[];
    /** Settings related to the model used by the agent. */
    model_settings?: ModelSettings;
    /** Secondary Model Settings used for analysis */
    analysis_model_settings?: ModelSettings;
    /** The size of the history to maintain for the agent. */
    history_size?: number;
    /** The planning configuration for the agent, if any. */
    plan?: any;
    /** A2A-specific fields */
    icon_url?: string;
    max_iterations?: number;
    skills?: AgentSkill[];
    /** List of sub-agents that this agent can transfer control to */
    sub_agents?: string[];
    agent_type?: string;
    context_size?: number;
    tools?: DistriBaseTool[];
    browser_config?: BrowserAgentConfig;
    /** Agent usage statistics */
    stats?: AgentStats;
}
/**
 * Agent usage statistics
 */
interface AgentStats {
    thread_count: number;
    sub_agent_usage_count: number;
    last_used_at?: string | null;
}
interface BrowserAgentConfig {
    enabled?: boolean;
    persist_session?: boolean;
    runtime?: DistriBrowserRuntimeConfig | null;
}
interface DistriBrowserRuntimeConfig {
    window_size?: [number, number];
    headless?: boolean;
    enable_stealth_mode?: boolean;
    enable_real_emulation?: boolean;
}
interface McpDefinition {
    /** The filter applied to the tools in this MCP definition. */
    filter?: string[];
    /** The name of the MCP server. */
    name: string;
    /** The type of the MCP server (Tool or Agent). */
    type?: McpServerType;
}
interface ModelSettings {
    model: string;
    temperature: number;
    max_tokens: number;
    context_size: number;
    top_p: number;
    frequency_penalty: number;
    presence_penalty: number;
    provider: ModelProviderConfig;
    /** Additional parameters for the agent, if any. */
    parameters?: any;
    /** The format of the response, if specified. */
    response_format?: any;
}
type McpServerType = 'tool' | 'agent';
type ModelProviderName = 'openai' | 'openai_compat' | 'vllora' | string;
type ModelProviderConfig = {
    name: 'openai';
} | {
    name: 'openai_compat';
    base_url: string;
    project_id?: string;
} | {
    name: 'vllora';
    base_url?: string;
} | {
    name: string;
    [key: string]: any;
};
/**
 * Distri Thread type for conversation management
 */
interface DistriThread {
    id: string;
    title: string;
    agent_id: string;
    agent_name: string;
    updated_at: string;
    message_count: number;
    last_message?: string;
    user_id?: string;
    external_id?: string;
    tags?: string[];
}
interface Thread {
    id: string;
    title: string;
    agent_id: string;
    agent_name: string;
    updated_at: string;
    message_count: number;
    last_message?: string;
    user_id?: string;
    external_id?: string;
    tags?: string[];
}
/**
 * Parameters for listing threads with filtering and pagination
 */
interface ThreadListParams {
    agent_id?: string;
    external_id?: string;
    search?: string;
    from_date?: string;
    to_date?: string;
    tags?: string[];
    limit?: number;
    offset?: number;
}
/**
 * Paginated response for thread listing
 */
interface ThreadListResponse {
    threads: DistriThread[];
    total: number;
    page: number;
    page_size: number;
}
/**
 * Agent usage information for sorting agents by thread count
 */
interface AgentUsageInfo {
    agent_id: string;
    agent_name: string;
    thread_count: number;
}
/**
 * Browser session info returned when creating a session
 */
interface BrowserSession {
    session_id: string;
    viewer_url?: string;
    stream_url?: string;
    frame_token?: string;
}
interface ChatProps {
    thread: Thread;
    agent: AgentDefinition;
    onThreadUpdate?: () => void;
}
interface SpeechToTextConfig {
    model?: 'whisper-1';
    language?: string;
    temperature?: number;
}
interface StreamingTranscriptionOptions {
    onTranscript?: (text: string, isFinal: boolean) => void;
    onError?: (error: Error) => void;
    onStart?: () => void;
    onEnd?: () => void;
}
/**
 * Connection Status
 */
type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';
/**
 * Default base URL for the Distri cloud service
 */
declare const DEFAULT_BASE_URL = "https://api.distri.dev";
/**
 * Distri Client Configuration
 */
interface DistriClientConfig {
    /**
     * Base URL of the Distri server
     * Default: https://api.distri.dev
     */
    baseUrl: string;
    /**
     * API version (currently unused)
     */
    apiVersion?: string;
    /**
     * Request timeout in milliseconds (default: 30000)
     */
    timeout?: number;
    /**
     * Number of retry attempts for failed requests (default: 3)
     */
    retryAttempts?: number;
    /**
     * Delay between retry attempts in milliseconds (default: 1000)
     */
    retryDelay?: number;
    /**
     * Enable debug logging
     */
    debug?: boolean;
    /**
     * Custom headers to include in all requests
     */
    headers?: Record<string, string>;
    /**
     * Request interceptor for modifying requests before sending
     */
    interceptor?: (init?: RequestInit) => Promise<RequestInit | undefined>;
    /**
     * Hook to refresh the access token when it expires.
     * Useful for public clients where only an access token is available.
     */
    onTokenRefresh?: () => Promise<string | null>;
    /**
     * Access token for bearer auth (optional)
     */
    accessToken?: string;
    /**
     * Refresh token for bearer auth (optional)
     */
    refreshToken?: string;
    /**
     * Token refresh skew in milliseconds (default: 60000)
     */
    tokenRefreshSkewMs?: number;
    /**
     * Client ID from Distri Cloud.
     */
    clientId?: string;
    /**
     * Workspace ID for multi-tenant support (Distri Cloud).
     * When provided, all requests will include X-Workspace-Id header.
     */
    workspaceId?: string;
}
interface LLMResponse {
    finish_reason: string;
    content: string;
    tool_calls: ToolCall[];
    token_usage: number;
    tools?: any[];
}
interface ExternalMcpServer {
    name: string;
    [key: string]: any;
}
interface ServerConfig {
    base_url?: string;
    host?: string;
    port?: number;
    [key: string]: any;
}
interface DistriConfiguration {
    name: string;
    version: string;
    description?: string;
    license?: string;
    working_directory?: string;
    agents?: string[];
    mcp_servers?: ExternalMcpServer[];
    server?: ServerConfig;
    model_settings?: ModelSettings;
    analysis_model_settings?: ModelSettings;
    keywords?: string[];
    [key: string]: any;
}
interface ConfigurationMeta {
    base_path: string;
    overrides_path: string;
    overrides_active: boolean;
}
interface ConfigurationResponse {
    configuration: DistriConfiguration;
    meta: ConfigurationMeta;
}
/**
 * Error Types
 */
declare class DistriError extends Error {
    code: string;
    details?: any | undefined;
    constructor(message: string, code: string, details?: any | undefined);
}
declare class A2AProtocolError extends DistriError {
    constructor(message: string, details?: any);
}
declare class ApiError extends DistriError {
    statusCode: number;
    constructor(message: string, statusCode: number, details?: any);
}
declare class ConnectionError extends DistriError {
    constructor(message: string, details?: any);
}

type A2AStreamEventData = Message | TaskStatusUpdateEvent | TaskArtifactUpdateEvent | Task;
declare function isDistriMessage(event: DistriStreamEvent): event is DistriMessage;
declare function isDistriEvent(event: DistriStreamEvent): event is DistriEvent;
type DistriChatMessage = DistriEvent | DistriMessage;
/**
 * Vote type for message feedback
 */
type VoteType = 'upvote' | 'downvote';
/**
 * Record of a message being read
 */
interface MessageReadStatus {
    thread_id: string;
    message_id: string;
    user_id: string;
    read_at: string;
}
/**
 * Request to vote on a message
 */
interface VoteMessageRequest {
    vote_type: VoteType;
    /** Required for downvotes */
    comment?: string;
}
/**
 * A vote on a message with optional feedback comment
 */
interface MessageVote {
    id: string;
    thread_id: string;
    message_id: string;
    user_id: string;
    vote_type: VoteType;
    /** Comment is required for downvotes, optional for upvotes */
    comment?: string;
    created_at: string;
    updated_at: string;
}
/**
 * Summary of votes for a message
 */
interface MessageVoteSummary {
    message_id: string;
    upvotes: number;
    downvotes: number;
    /** Current user's vote on this message, if any */
    user_vote?: VoteType;
}

/**
 * Converts an A2A Message to a DistriMessage
 */
declare function convertA2AMessageToDistri(a2aMessage: Message): DistriMessage;
/**
 * Converts A2A status-update events to DistriEvent based on metadata type
 */
declare function convertA2AStatusUpdateToDistri(statusUpdate: any): DistriEvent | null;
/**
 * Enhanced decoder for A2A stream events that properly handles all event types
 */
declare function decodeA2AStreamEvent(event: any): DistriChatMessage | null;
/**
 * Process A2A stream data (like from stream.json) and convert to DistriMessage/DistriEvent/DistriArtifact array
 */
declare function processA2AStreamData(streamData: any[]): (DistriMessage | DistriEvent)[];
/**
 * Process A2A messages.json data and convert to DistriMessage array
 */
declare function processA2AMessagesData(data: any[]): DistriMessage[];
/**
 * Converts an A2A Part to a DistriPart
 */
declare function convertA2APartToDistri(a2aPart: Part): DistriPart;
/**
 * Converts a DistriMessage to an A2A Message using the provided context
 */
declare function convertDistriMessageToA2A(distriMessage: DistriMessage, context: InvokeContext): Message;
/**
 * Converts a DistriPart to an A2A Part
 */
declare function convertDistriPartToA2A(distriPart: DistriPart): Part;
/**
 * Extract text content from DistriMessage
 */
declare function extractTextFromDistriMessage(message: DistriMessage): string;
/**
 * Extract tool calls from DistriMessage
 */
declare function extractToolCallsFromDistriMessage(message: DistriMessage): any[];
/**
 * Extract tool results from DistriMessage
 */
declare function extractToolResultsFromDistriMessage(message: DistriMessage): any[];

export { A2AProtocolError, type A2AStreamEventData, type ActionPlanStep, Agent, type AgentConfigWithTools, type AgentDefinition, type AgentHandoverEvent, type AgentStats, type AgentUsageInfo, ApiError, type AssistantWithToolCalls, type BasePlanStep, type BatchToolCallsStep, type BrowserAgentConfig, type BrowserScreenshotEvent, type BrowserSession, type BrowserSessionStartedEvent, type ChatCompletionChoice, type ChatCompletionMessage, type ChatCompletionRequest, type ChatCompletionResponse, type ChatCompletionResponseFormat, type ChatCompletionRole, type ChatProps, type CodePlanStep, type ConfigurationMeta, type ConfigurationResponse, ConnectionError, type ConnectionStatus, DEFAULT_BASE_URL, type DataPart, type DistriBaseTool, type DistriBrowserRuntimeConfig, type DistriChatMessage, DistriClient, type DistriClientConfig, type DistriConfiguration, DistriError, type DistriEvent, type DistriFnTool, type DistriMessage, type DistriMessageMetadata, type DistriPart, type DistriPartWithMetadata, type DistriPlan, type DistriStreamEvent, type DistriThread, type DynamicMetadata, type ExternalMcpServer, ExternalToolValidationError, type ExternalToolValidationResult, type FeedbackReceivedEvent, type FileBytes, type FileType, type FileUrl, type FinalResultPlanStep, type HookContext, type HookHandler, type HookMutation, type ImagePart, type InlineHookEventData, type InlineHookRequest, type InlineHookRequestedEvent, type InvokeConfig, type InvokeContext, type InvokeResult, type LLMResponse, type LlmExecuteOptions, type LlmPlanStep, type McpDefinition, type McpServerType, type MessageReadStatus, type MessageRole, type MessageVote, type MessageVoteSummary, type ModelProviderConfig, type ModelProviderName, type ModelSettings, type PartMetadata, type PlanAction, type PlanFinishedEvent, type PlanPrunedEvent, type PlanStartedEvent, type PlanStep, type PromptSection, type ReactStep, type Role, type RunErrorEvent, type RunFinishedEvent, type RunStartedEvent, type ServerConfig, type SpeechToTextConfig, type StepCompletedEvent, type StepStartedEvent, type StreamingTranscriptionOptions, type TextMessageContentEvent, type TextMessageEndEvent, type TextMessageStartEvent, type TextPart, type ThoughtPlanStep, type ThoughtStep, type Thread, type ThreadListParams, type ThreadListResponse, type TodoItem, type TodoStatus, type TodosUpdatedEvent, type ToolCall, type ToolCallPart, type ToolCallsEvent, type ToolDefinition, type ToolExecutionEndEvent, type ToolExecutionOptions, type ToolExecutionStartEvent, type ToolHandler, type ToolRejectedEvent, type ToolResult, type ToolResultData, type ToolResultRefPart, type ToolResults, type ToolResultsEvent, type UseToolsOptions, type VoteMessageRequest, type VoteType, convertA2AMessageToDistri, convertA2APartToDistri, convertA2AStatusUpdateToDistri, convertDistriMessageToA2A, convertDistriPartToA2A, createFailedToolResult, createSuccessfulToolResult, decodeA2AStreamEvent, extractTextFromDistriMessage, extractToolCallsFromDistriMessage, extractToolResultData, extractToolResultsFromDistriMessage, isArrayParts, isDistriEvent, isDistriMessage, processA2AMessagesData, processA2AStreamData, uuidv4 };
