"use client";
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  ASK_FOLLOW_UP_TOOL_NAME: () => ASK_FOLLOW_UP_TOOL_NAME,
  AgentSelect: () => AgentSelect,
  AppSidebar: () => AppSidebar,
  AssistantMessageRenderer: () => AssistantMessageRenderer,
  AuthLoading: () => AuthLoading,
  Badge: () => Badge,
  BrowserPreviewPanel: () => BrowserPreviewPanel,
  BrowserViewport: () => BrowserViewport,
  Button: () => Button,
  Card: () => Card,
  CardContent: () => CardContent,
  CardDescription: () => CardDescription,
  CardFooter: () => CardFooter,
  CardHeader: () => CardHeader,
  CardTitle: () => CardTitle,
  Chat: () => Chat,
  ChatInner: () => ChatInner,
  ChatInput: () => ChatInput,
  ConfigurationPanel: () => ConfigurationPanel,
  Dialog: () => DialogRoot,
  DialogContent: () => DialogContent,
  DialogHeader: () => DialogHeader,
  DialogTitle: () => DialogTitle,
  DialogTrigger: () => DialogTrigger,
  DistriAuthProvider: () => DistriAuthProvider,
  DistriContext: () => DistriContext,
  DistriProvider: () => DistriProvider,
  DropdownMenu: () => DropdownMenu,
  DropdownMenuCheckboxItem: () => DropdownMenuCheckboxItem,
  DropdownMenuContent: () => DropdownMenuContent,
  DropdownMenuGroup: () => DropdownMenuGroup,
  DropdownMenuItem: () => DropdownMenuItem,
  DropdownMenuLabel: () => DropdownMenuLabel,
  DropdownMenuPortal: () => DropdownMenuPortal,
  DropdownMenuRadioGroup: () => DropdownMenuRadioGroup,
  DropdownMenuRadioItem: () => DropdownMenuRadioItem,
  DropdownMenuSeparator: () => DropdownMenuSeparator,
  DropdownMenuShortcut: () => DropdownMenuShortcut,
  DropdownMenuSub: () => DropdownMenuSub,
  DropdownMenuSubContent: () => DropdownMenuSubContent,
  DropdownMenuSubTrigger: () => DropdownMenuSubTrigger,
  DropdownMenuTrigger: () => DropdownMenuTrigger,
  ImageRenderer: () => ImageRenderer,
  Input: () => Input,
  LoadingAnimation: () => LoadingAnimation,
  LoadingShimmer: () => LoadingShimmer,
  MessageFeedback: () => MessageFeedback,
  MessageReadProvider: () => MessageReadProvider,
  MessageReadTracker: () => MessageReadTracker,
  MessageRenderer: () => MessageRenderer,
  Select: () => Select,
  SelectContent: () => SelectContent,
  SelectGroup: () => SelectGroup,
  SelectItem: () => SelectItem,
  SelectLabel: () => SelectLabel,
  SelectScrollDownButton: () => SelectScrollDownButton,
  SelectScrollUpButton: () => SelectScrollUpButton,
  SelectSeparator: () => SelectSeparator,
  SelectTrigger: () => SelectTrigger,
  SelectValue: () => SelectValue,
  Separator: () => Separator2,
  Sheet: () => Sheet,
  SheetContent: () => SheetContent,
  SheetDescription: () => SheetDescription,
  SheetFooter: () => SheetFooter,
  SheetHeader: () => SheetHeader,
  SheetTitle: () => SheetTitle,
  Sidebar: () => Sidebar,
  SidebarContent: () => SidebarContent,
  SidebarFooter: () => SidebarFooter,
  SidebarGroup: () => SidebarGroup,
  SidebarGroupAction: () => SidebarGroupAction,
  SidebarGroupContent: () => SidebarGroupContent,
  SidebarGroupLabel: () => SidebarGroupLabel,
  SidebarHeader: () => SidebarHeader,
  SidebarInset: () => SidebarInset,
  SidebarMenu: () => SidebarMenu,
  SidebarMenuAction: () => SidebarMenuAction,
  SidebarMenuBadge: () => SidebarMenuBadge,
  SidebarMenuButton: () => SidebarMenuButton,
  SidebarMenuItem: () => SidebarMenuItem,
  SidebarMenuSkeleton: () => SidebarMenuSkeleton,
  SidebarMenuSub: () => SidebarMenuSub,
  SidebarMenuSubButton: () => SidebarMenuSubButton,
  SidebarMenuSubItem: () => SidebarMenuSubItem,
  SidebarProvider: () => SidebarProvider,
  SidebarRail: () => SidebarRail,
  SidebarSeparator: () => SidebarSeparator,
  SidebarTrigger: () => SidebarTrigger,
  Skeleton: () => Skeleton,
  StepBasedRenderer: () => StepBasedRenderer,
  StreamingTextRenderer: () => StreamingTextRenderer,
  Textarea: () => Textarea,
  ThemeProvider: () => ThemeProvider,
  ThemeToggle: () => ThemeToggle,
  ThinkingRenderer: () => ThinkingRenderer,
  TodosDisplay: () => TodosDisplay,
  Tooltip: () => Tooltip,
  TooltipContent: () => TooltipContent,
  TooltipProvider: () => TooltipProvider,
  TooltipTrigger: () => TooltipTrigger,
  TypingIndicator: () => TypingIndicator,
  UserMessageRenderer: () => UserMessageRenderer,
  VoiceInput: () => VoiceInput,
  createAskFollowUpTool: () => createAskFollowUpTool,
  extractContent: () => extractContent,
  useAgent: () => useAgent,
  useAgentDefinitions: () => useAgentDefinitions,
  useAgentsByUsage: () => useAgentsByUsage,
  useChat: () => useChat,
  useChatMessages: () => useChatMessages,
  useChatStateStore: () => useChatStateStore,
  useConfiguration: () => useConfiguration,
  useDistri: () => useDistri,
  useDistriAuth: () => useDistriAuth,
  useDistriToken: () => useDistriToken,
  useMessageReadContext: () => useMessageReadContext,
  useMessageReadStatus: () => useMessageReadStatus,
  useMessageVote: () => useMessageVote,
  useMessageVotes: () => useMessageVotes,
  useSidebar: () => useSidebar,
  useSpeechToText: () => useSpeechToText,
  useTheme: () => useTheme,
  useThreadReadStatus: () => useThreadReadStatus,
  useThreads: () => useThreads,
  useTts: () => useTts,
  useWorkspace: () => useWorkspace,
  wrapFnToolAsUiTool: () => wrapFnToolAsUiTool,
  wrapTools: () => wrapTools
});
module.exports = __toCommonJS(index_exports);

// src/useChat.ts
var import_react3 = require("react");
var import_core3 = require("@distri/core");
var import_core4 = require("@distri/core");

// src/stores/chatStateStore.ts
var import_zustand = require("zustand");
var import_core2 = require("@distri/core");

// src/components/renderers/tools/DefaultToolActions.tsx
var import_react = require("react");

// src/components/ui/button.tsx
var React = __toESM(require("react"), 1);

// src/lib/utils.ts
var import_clsx = require("clsx");
var import_tailwind_merge = require("tailwind-merge");
function cn(...inputs) {
  return (0, import_tailwind_merge.twMerge)((0, import_clsx.clsx)(inputs));
}

// src/components/ui/button.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var buttonVariants = {
  variant: {
    default: "bg-primary text-primary-foreground hover:bg-primary/90",
    destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
    outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
    secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
    ghost: "hover:bg-accent hover:text-accent-foreground",
    link: "text-primary underline-offset-4 hover:underline"
  },
  size: {
    default: "h-10 px-4 py-2",
    sm: "h-9 rounded-md px-3",
    lg: "h-11 rounded-md px-8",
    icon: "h-10 w-10"
  }
};
var Button = React.forwardRef(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "button",
      {
        className: cn(
          "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
          buttonVariants.variant[variant],
          buttonVariants.size[size],
          className
        ),
        ref,
        ...props
      }
    );
  }
);
Button.displayName = "Button";

// src/components/ui/checkbox.tsx
var React2 = __toESM(require("react"), 1);
var CheckboxPrimitive = __toESM(require("@radix-ui/react-checkbox"), 1);
var import_lucide_react = require("lucide-react");
var import_jsx_runtime2 = require("react/jsx-runtime");
var Checkbox = React2.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
  CheckboxPrimitive.Root,
  {
    ref,
    className: cn(
      "peer h-4 w-4 shrink-0 rounded-sm border border-primary shadow focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
      className
    ),
    ...props,
    children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      CheckboxPrimitive.Indicator,
      {
        className: cn("flex items-center justify-center text-current"),
        children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_lucide_react.Check, { className: "h-4 w-4" })
      }
    )
  }
));
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

// src/components/renderers/tools/DefaultToolActions.tsx
var import_lucide_react2 = require("lucide-react");
var import_core = require("@distri/core");
var import_jsx_runtime3 = require("react/jsx-runtime");
var DefaultToolActions = ({
  toolCall,
  toolCallState,
  completeTool,
  tool
}) => {
  const [isProcessing, setIsProcessing] = (0, import_react.useState)(false);
  const [hasExecuted, setHasExecuted] = (0, import_react.useState)(false);
  const [dontAskAgain, setDontAskAgain] = (0, import_react.useState)(false);
  const autoExecute = tool.autoExecute;
  const input = toolCall.input;
  const toolName = toolCall.tool_name;
  const isLiveStream = toolCallState?.isLiveStream || false;
  const hasTriggeredRef = (0, import_react.useRef)(false);
  const getApprovalPreferences = (0, import_react.useCallback)(() => {
    try {
      const stored = localStorage.getItem("distri-tool-preferences");
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  }, []);
  const saveApprovalPreference = (0, import_react.useCallback)((toolName2, approved) => {
    try {
      const preferences = getApprovalPreferences();
      preferences[toolName2] = approved;
      localStorage.setItem("distri-tool-preferences", JSON.stringify(preferences));
    } catch {
    }
  }, [getApprovalPreferences]);
  const handleExecute = (0, import_react.useCallback)(async () => {
    if (isProcessing || hasExecuted) return;
    if (!hasTriggeredRef.current) {
      hasTriggeredRef.current = true;
    }
    if (dontAskAgain) {
      saveApprovalPreference(toolName, true);
    }
    setIsProcessing(true);
    setHasExecuted(true);
    try {
      const result = await tool.handler(toolCall.input);
      if (!tool.is_final) {
        const toolResult = (0, import_core.createSuccessfulToolResult)(
          toolCall.tool_call_id,
          toolName,
          result
        );
        await completeTool(toolResult);
      } else {
        console.log("Tool is final, no action required");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const toolResult = (0, import_core.createFailedToolResult)(
        toolCall.tool_call_id,
        toolName,
        errorMessage,
        "Tool execution failed"
      );
      await completeTool(toolResult);
    } finally {
      setIsProcessing(false);
    }
  }, [completeTool, dontAskAgain, hasExecuted, isProcessing, saveApprovalPreference, tool, toolCall.input, toolCall.tool_call_id, toolName]);
  const handleCancel = (0, import_react.useCallback)(() => {
    if (isProcessing || hasExecuted) return;
    if (!hasTriggeredRef.current) {
      hasTriggeredRef.current = true;
    }
    if (dontAskAgain) {
      saveApprovalPreference(toolName, false);
    }
    setHasExecuted(true);
    const toolResult = (0, import_core.createFailedToolResult)(
      toolCall.tool_call_id,
      toolName,
      "User cancelled the operation",
      "Tool execution cancelled by user"
    );
    completeTool(toolResult);
  }, [completeTool, dontAskAgain, hasExecuted, isProcessing, saveApprovalPreference, toolCall.tool_call_id, toolName]);
  (0, import_react.useEffect)(() => {
    if (!isLiveStream) return;
    const preferences = getApprovalPreferences();
    const autoApprove = preferences[toolName];
    if (autoApprove === void 0) return;
    if (hasExecuted || isProcessing) return;
    if (hasTriggeredRef.current) return;
    hasTriggeredRef.current = true;
    if (autoApprove) {
      handleExecute();
    } else {
      handleCancel();
    }
  }, [getApprovalPreferences, handleCancel, handleExecute, hasExecuted, isLiveStream, isProcessing, toolName]);
  (0, import_react.useEffect)(() => {
    if (!isLiveStream) return;
    const preferences = getApprovalPreferences();
    const hasPreference = preferences[toolName] !== void 0;
    if (!autoExecute || hasPreference || hasExecuted || isProcessing) {
      return;
    }
    if (hasTriggeredRef.current) return;
    hasTriggeredRef.current = true;
    handleExecute();
  }, [autoExecute, getApprovalPreferences, handleExecute, hasExecuted, isLiveStream, isProcessing, toolName]);
  if (hasExecuted && !isProcessing) {
    const wasSuccessful = !toolCallState?.error;
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "border rounded-lg p-4 bg-muted/50", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "flex items-center gap-2 mb-2", children: [
        wasSuccessful ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_lucide_react2.CheckCircle, { className: "h-4 w-4 text-green-600" }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_lucide_react2.XCircle, { className: "h-4 w-4 text-red-600" }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "font-medium", children: wasSuccessful ? "Tool Executed Successfully" : "Tool Execution Failed" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("p", { className: "text-sm text-muted-foreground", children: [
        "Tool: ",
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("code", { className: "bg-background px-1 rounded", children: toolName })
      ] }),
      toolCallState?.result && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "mt-2", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "text-xs text-muted-foreground mb-1", children: "Result:" }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("pre", { className: "text-xs bg-background p-2 rounded border overflow-x-auto", children: typeof toolCallState.result === "string" ? toolCallState.result : JSON.stringify(toolCallState.result, null, 2) })
      ] }),
      toolCallState?.error && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "mt-2", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "text-xs text-destructive mb-1", children: "Error:" }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("p", { className: "text-xs text-destructive bg-destructive/10 p-2 rounded border", children: toolCallState.error })
      ] })
    ] });
  }
  if (isProcessing) {
    return null;
  }
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "border rounded-lg p-4 bg-background", children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "flex items-center gap-2 mb-3", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_lucide_react2.Wrench, { className: "h-4 w-4 text-primary" }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "font-medium", children: "Tool Action Required" })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "mb-4", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("p", { className: "text-sm mb-2", children: [
        "Execute tool: ",
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("code", { className: "bg-muted px-1 rounded", children: toolName })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { className: "text-xs text-muted-foreground mb-1", children: "Input:" }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("pre", { className: "text-xs bg-muted p-2 rounded border overflow-x-auto", children: JSON.stringify(input, null, 2) })
    ] }),
    !autoExecute && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "space-y-3", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "flex items-center space-x-2", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          Checkbox,
          {
            id: "dont-ask-again-tool",
            checked: dontAskAgain,
            onCheckedChange: (checked) => setDontAskAgain(checked)
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
          "label",
          {
            htmlFor: "dont-ask-again-tool",
            className: "text-sm text-muted-foreground cursor-pointer",
            children: [
              "Don't ask again for ",
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { className: "font-mono text-xs", children: toolName })
            ]
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { className: "flex gap-2", children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          Button,
          {
            size: "sm",
            variant: "destructive",
            onClick: handleCancel,
            disabled: isProcessing,
            children: "Cancel"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
          Button,
          {
            size: "sm",
            onClick: handleExecute,
            disabled: isProcessing,
            children: "Confirm"
          }
        )
      ] })
    ] })
  ] });
};

// src/stores/chatStateStore.ts
var import_react2 = __toESM(require("react"), 1);
var completingToolCallIds = /* @__PURE__ */ new Set();
var useChatStateStore = (0, import_zustand.create)((set, get) => ({
  isStreaming: false,
  isLoading: false,
  error: null,
  debug: false,
  tasks: /* @__PURE__ */ new Map(),
  plans: /* @__PURE__ */ new Map(),
  steps: /* @__PURE__ */ new Map(),
  toolCalls: /* @__PURE__ */ new Map(),
  currentRunId: void 0,
  currentTaskId: void 0,
  currentPlanId: void 0,
  streamingIndicator: void 0,
  currentThought: void 0,
  messages: [],
  browserSessionId: void 0,
  browserViewerUrl: void 0,
  browserStreamUrl: void 0,
  todos: [],
  tools: {
    tools: [],
    agent_tools: /* @__PURE__ */ new Map()
  },
  // State actions
  setStreaming: (isStreaming) => {
    set({ isStreaming });
  },
  setLoading: (isLoading) => {
    set({ isLoading });
  },
  setError: (error) => {
    set({ error });
  },
  setDebug: (debug) => {
    set({ debug });
  },
  setStreamingIndicator: (indicator) => {
    set({ streamingIndicator: indicator });
  },
  setCurrentThought: (thought) => {
    set({ currentThought: thought });
  },
  setBrowserSession: (sessionId, viewerUrl, streamUrl) => {
    set({
      browserSessionId: sessionId,
      browserViewerUrl: viewerUrl,
      browserStreamUrl: streamUrl
    });
  },
  clearBrowserSession: () => {
    set({
      browserSessionId: void 0,
      browserViewerUrl: void 0,
      browserStreamUrl: void 0
    });
  },
  setTodos: (todos) => {
    set({ todos });
  },
  getToolByName: (toolName) => {
    const state = get();
    const externalTool = state.externalTools?.find((t) => t.name === toolName);
    if (externalTool) {
      return { ...externalTool, executionType: "external" };
    }
    return void 0;
  },
  addMessage: (message) => {
    set((state) => {
      if ((0, import_core2.isDistriEvent)(message)) {
        const event = message;
        if (event.type === "browser_session_started") {
          return {
            ...state,
            browserSessionId: event.data.session_id,
            browserViewerUrl: event.data.viewer_url,
            browserStreamUrl: event.data.stream_url
          };
        }
        if (event.type === "text_message_start") {
          const messageId = event.data.message_id;
          const stepId = event.data.step_id;
          const role = event.data.role;
          const isFinal = event.data.is_final;
          const newDistriMessage = {
            id: messageId,
            role,
            parts: [{ part_type: "text", data: "" }],
            created_at: (/* @__PURE__ */ new Date()).getTime(),
            step_id: stepId,
            is_final: isFinal
          };
          const messages = [...state.messages, newDistriMessage];
          if (stepId) {
            const existingStep = get().steps.get(stepId);
            if (existingStep) {
              get().updateStep(stepId, {
                // Keep the original title from step_started, just ensure it's running
                status: "running"
              });
            }
          }
          return { ...state, messages };
        } else if (event.type === "text_message_content") {
          const messageId = event.data.message_id;
          const delta = event.data.delta;
          const existingIndex = state.messages.findIndex(
            (m) => (0, import_core2.isDistriMessage)(m) && m.id === messageId
          );
          if (existingIndex >= 0) {
            const existingMessage = state.messages[existingIndex];
            const textPartIndex = existingMessage.parts.findIndex((p) => p.part_type === "text");
            let updatedParts;
            if (textPartIndex >= 0) {
              const existingTextPart = existingMessage.parts[textPartIndex];
              updatedParts = existingMessage.parts.map(
                (part, idx) => idx === textPartIndex ? { part_type: "text", data: existingTextPart.data + delta } : part
              );
            } else {
              updatedParts = [...existingMessage.parts, { part_type: "text", data: delta }];
            }
            const updatedMessage = {
              ...existingMessage,
              parts: updatedParts
            };
            const messages = state.messages.map(
              (msg, idx) => idx === existingIndex ? updatedMessage : msg
            );
            return { ...state, messages };
          } else {
            console.log("\u{1F527} text message content sent without existing message. This should not happen.", message);
            return state;
          }
        } else if (event.type === "text_message_end") {
          const stepId = event.data.step_id;
          if (stepId) {
            const existingStep = get().steps.get(stepId);
            if (existingStep) {
              get().updateStep(stepId, {
                status: "completed",
                endTime: Date.now()
              });
            }
          }
          get().setCurrentThought(void 0);
          return state;
        } else {
          const stateOnlyEvents = [
            "run_started",
            "run_finished",
            "plan_started",
            "plan_finished",
            "step_started",
            "step_completed",
            "tool_results"
          ];
          if (!stateOnlyEvents.includes(event.type)) {
            const messages = [...state.messages, message];
            return { ...state, messages };
          }
          return state;
        }
      } else {
        const messages = [...state.messages, message];
        return { ...state, messages };
      }
    });
  },
  // State actions
  processMessage: (message, isFromStream = false) => {
    const timestamp = Date.now();
    const isDebugEnabled = get().debug;
    if (isDebugEnabled) {
      console.log("\u{1F527} Processing message:");
      console.log(message);
    }
    get().addMessage(message);
    if ((0, import_core2.isDistriEvent)(message)) {
      const event = message;
      if (isDebugEnabled && message.type !== "text_message_content") {
        console.log("\u{1F3EA} EVENT:", message);
      }
      switch (message.type) {
        case "run_started":
          const runStartedEvent = event;
          const runId = runStartedEvent.data.runId;
          const taskId = runStartedEvent.data.taskId;
          if (isDebugEnabled) {
            console.log("\u{1F3EA} run_started with IDs:", { runId, taskId });
          }
          if (taskId) {
            get().updateTask(taskId, {
              id: taskId,
              runId,
              title: "Agent Run",
              status: "running",
              startTime: timestamp,
              metadata: event.data
            });
          }
          const shouldUpdateTaskId = !get().currentTaskId;
          set({
            currentRunId: runId,
            currentTaskId: shouldUpdateTaskId ? taskId : get().currentTaskId
          });
          get().setStreamingIndicator("typing");
          set({ isStreaming: true });
          break;
        case "run_finished":
          const runFinishedEvent = event;
          const finishedTaskId = runFinishedEvent.data.taskId;
          if (finishedTaskId) {
            get().updateTask(finishedTaskId, {
              status: "completed",
              endTime: timestamp
            });
          }
          const currentToolCalls = get().toolCalls;
          let toolCallsChanged = false;
          currentToolCalls.forEach((tc) => {
            if (tc.status === "pending" || tc.status === "running") {
              tc.status = "completed";
              tc.endTime = Date.now();
              toolCallsChanged = true;
            }
          });
          if (toolCallsChanged) {
            set({ toolCalls: new Map(currentToolCalls) });
          }
          set({ isStreaming: false, isLoading: false });
          get().setStreamingIndicator(void 0);
          get().setCurrentThought(void 0);
          break;
        case "run_error":
          const runErrorEvent = event;
          const errorTaskId = runErrorEvent.data.code ? "subtask" : get().currentTaskId;
          const currentMainTaskIdForError = get().currentTaskId;
          if (errorTaskId) {
            get().updateTask(errorTaskId, {
              status: "failed",
              endTime: timestamp,
              error: runErrorEvent.data.message || "Unknown error"
            });
          }
          if (errorTaskId === currentMainTaskIdForError) {
            console.log("\u{1F6D1} Stopping streaming - main task errored");
            const errorToolCalls = get().toolCalls;
            let errorToolCallsChanged = false;
            errorToolCalls.forEach((tc) => {
              if (tc.status === "pending" || tc.status === "running") {
                tc.status = "error";
                tc.endTime = Date.now();
                errorToolCallsChanged = true;
              }
            });
            if (errorToolCallsChanged) {
              set({ toolCalls: new Map(errorToolCalls) });
            }
            get().setStreamingIndicator(void 0);
            get().setCurrentThought(void 0);
            set({ isStreaming: false, isLoading: false });
          } else {
            console.log("\u{1F4DD} Sub-task errored, continuing stream");
          }
          break;
        case "plan_started":
          const planId = `plan_${Date.now()}`;
          const currentRunId = get().currentRunId;
          const currentTaskId = get().currentTaskId;
          get().updatePlan(planId, {
            id: planId,
            runId: currentRunId,
            // Link to the current run
            taskId: currentTaskId,
            // Link to the current task
            steps: [],
            status: "running",
            startTime: timestamp
          });
          set({ currentPlanId: planId });
          break;
        case "plan_finished":
          const currentPlanId = get().currentPlanId;
          if (currentPlanId) {
            const plan = get().getPlanById(currentPlanId);
            const thinkingDuration = plan?.startTime ? timestamp - plan.startTime : 0;
            get().updatePlan(currentPlanId, {
              status: "completed",
              endTime: timestamp,
              thinkingDuration
            });
          }
          break;
        case "tool_execution_start":
          const toolExecutionStartEvent = event;
          if (get().getToolCallById(toolExecutionStartEvent.data.tool_call_id)) {
            get().updateToolCallStatus(toolExecutionStartEvent.data.tool_call_id, {
              status: "running",
              startTime: timestamp
            });
          } else {
            get().toolCalls.set(toolExecutionStartEvent.data.tool_call_id, {
              tool_call_id: toolExecutionStartEvent.data.tool_call_id,
              tool_name: toolExecutionStartEvent.data.tool_call_name,
              input: toolExecutionStartEvent.data.input,
              status: "running",
              startTime: timestamp,
              isExternal: false,
              isLiveStream: isFromStream
            });
          }
          break;
        case "tool_execution_end":
          const toolExecutionEndEvent = event;
          const finishedToolCallId = toolExecutionEndEvent.data.tool_call_id;
          if (finishedToolCallId) {
            get().updateToolCallStatus(finishedToolCallId, {
              status: "completed",
              endTime: timestamp
            });
          }
          break;
        case "text_message_start":
          break;
        case "text_message_content":
          break;
        case "text_message_end":
          break;
        case "step_started":
          const stepId = message.data.step_id;
          get().updateStep(stepId, {
            id: stepId,
            title: message.data.step_title,
            index: message.data.step_index,
            status: "running",
            startTime: timestamp
          });
          break;
        case "step_completed":
          const completedStepId = message.data.step_id;
          get().updateStep(completedStepId, {
            status: "completed",
            endTime: timestamp
          });
          break;
        case "tool_calls":
          if (message.data.tool_calls && Array.isArray(message.data.tool_calls)) {
            message.data.tool_calls.forEach(async (toolCall) => {
              if (get().toolCalls.has(toolCall.tool_call_id)) {
                console.log("\u{1F501} Ignoring duplicate tool_call event", toolCall.tool_call_id);
                return;
              }
              get().initToolCall({
                tool_call_id: toolCall.tool_call_id,
                tool_name: toolCall.tool_name,
                input: toolCall.input
              }, timestamp, isFromStream);
            });
          }
          break;
        case "tool_results":
          if (message.data.results && Array.isArray(message.data.results)) {
            message.data.results.forEach((result) => {
              get().updateToolCallStatus(result.tool_call_id, {
                status: "completed",
                result,
                endTime: timestamp
              });
            });
          }
          break;
        case "agent_handover":
          break;
        case "todos_updated": {
          const todosEvent = event;
          if (todosEvent.data.todos) {
            get().setTodos(todosEvent.data.todos);
          }
          break;
        }
        default:
          break;
      }
    }
  },
  initToolCall: (toolCall, timestamp, isFromStream = false) => {
    const externalTools = get().externalTools || [];
    const externalTool = externalTools.find((t) => t.name === toolCall.tool_name);
    const existingToolCall = get().toolCalls.get(toolCall.tool_call_id);
    if (existingToolCall) {
      console.log("\u{1F501} initToolCall skipped duplicate", toolCall.tool_call_id);
      return;
    }
    set((state) => {
      const newState = { ...state };
      newState.toolCalls.set(toolCall.tool_call_id, {
        tool_call_id: toolCall.tool_call_id,
        tool_name: toolCall.tool_name || "Unknown Tool",
        input: toolCall.input || {},
        status: "pending",
        startTime: timestamp || Date.now(),
        isExternal: !!externalTool,
        isLiveStream: isFromStream
      });
      return newState;
    });
    if (externalTool) {
      console.log("\u{1F527} Tool found:", {
        externalTool,
        toolName: toolCall.tool_name
      });
      get().executeTool(toolCall, externalTool);
    } else {
      console.log("\u{1F527} Tool not external:", {
        toolName: toolCall.tool_name
      });
    }
  },
  updateToolCallStatus: (toolCallId, status) => {
    set((state) => {
      const newState = { ...state };
      const existingToolCall = newState.toolCalls.get(toolCallId);
      if (existingToolCall) {
        newState.toolCalls.set(toolCallId, {
          ...existingToolCall,
          ...status,
          endTime: status.status === "completed" || status.status === "error" ? Date.now() : existingToolCall.endTime
        });
      }
      return newState;
    });
  },
  completeTool: async (toolCall, result) => {
    console.log("completeTool", toolCall, result);
    if (completingToolCallIds.has(toolCall.tool_call_id)) {
      console.warn(`Skipping duplicate completeTool for ${toolCall.tool_call_id}`);
      return;
    }
    completingToolCallIds.add(toolCall.tool_call_id);
    const toolResultData = (0, import_core2.extractToolResultData)(result);
    const resultIndicatesError = toolResultData?.success === false || Boolean(toolResultData?.error);
    const resultErrorMessage = toolResultData?.error ?? (toolResultData?.success === false ? "Tool execution failed" : void 0);
    get().updateToolCallStatus(toolCall.tool_call_id, {
      status: resultIndicatesError ? "error" : "completed",
      result,
      error: resultIndicatesError ? resultErrorMessage : void 0,
      endTime: Date.now()
    });
    const state = get();
    const agent = state.agent;
    if (!agent) {
      console.error("\u274C Agent not found");
      get().updateToolCallStatus(toolCall.tool_call_id, {
        status: "error",
        error: resultErrorMessage ?? "Agent not available to complete tool",
        endTime: Date.now()
      });
      completingToolCallIds.delete(toolCall.tool_call_id);
      return;
    }
    console.log("state.toolCalls", state.toolCalls);
    try {
      console.log(`\u{1F527} Executing external function tool: ${toolCall.tool_name}`);
      console.log(`\u2705 Tool ${toolCall.tool_name} executed successfully:`, result);
      await agent.completeTool(result);
      console.log(`\u2705 Tool completion sent to agent via API`);
    } catch (error) {
      console.error(`\u274C Error executing tool ${toolCall.tool_name}:`, error);
      get().updateToolCallStatus(toolCall.tool_call_id, {
        status: "error",
        error: error instanceof Error ? error.message : "Tool completion failed",
        endTime: Date.now()
      });
    } finally {
      completingToolCallIds.delete(toolCall.tool_call_id);
    }
  },
  executeTool: (toolCall, distriTool) => {
    try {
      const commonProps = {
        tool_name: toolCall.tool_name,
        input: toolCall.input,
        startTime: Date.now(),
        isExternal: !!distriTool,
        // Only mark as external if it's actually an external tool
        status: "running"
      };
      const completeToolFn = (result) => {
        try {
          get().completeTool(toolCall, result);
        } catch (error) {
          console.error(`\u274C Error completing tool ${toolCall.tool_name}:`, error);
          get().updateToolCallStatus(toolCall.tool_call_id, {
            status: "error",
            error: error instanceof Error ? error.message : "Tool completion failed",
            endTime: Date.now()
          });
        }
      };
      const toolCallState = get().toolCalls.get(toolCall.tool_call_id);
      console.log("distriTool", distriTool);
      let component;
      try {
        if (distriTool?.type === "ui") {
          const uiTool = distriTool;
          component = import_react2.default.createElement(uiTool.component, {
            toolCall,
            toolCallState,
            completeTool: completeToolFn,
            tool: distriTool
          });
        } else if (distriTool?.type === "function") {
          const fnTool = distriTool;
          fnTool.autoExecute = fnTool.autoExecute === true;
          const error = validateToolCallInput(toolCall);
          if (error) {
            completeToolFn({
              tool_call_id: toolCall.tool_call_id,
              tool_name: toolCall.tool_name,
              parts: [{ part_type: "data", data: { result: null, error, success: false } }]
            });
            return;
          }
          component = import_react2.default.createElement(DefaultToolActions, {
            toolCall,
            toolCallState: get().toolCalls.get(toolCall.tool_call_id),
            completeTool: completeToolFn,
            tool: fnTool
          });
        }
      } catch (componentError) {
        console.error(`\u274C Error creating component for tool ${toolCall.tool_name}:`, componentError);
        component = import_react2.default.createElement("div", {
          className: "text-red-500 p-2 border border-red-200 rounded bg-red-50"
        }, `Error loading tool: ${componentError instanceof Error ? componentError.message : "Unknown component error"}`);
        get().updateToolCallStatus(toolCall.tool_call_id, {
          ...commonProps,
          status: "error",
          error: `Component creation failed: ${componentError instanceof Error ? componentError.message : "Unknown error"}`,
          component,
          endTime: Date.now()
        });
        return;
      }
      get().updateToolCallStatus(toolCall.tool_call_id, {
        ...commonProps,
        component
      });
    } catch (error) {
      console.error(`\u274C Critical error in executeTool for ${toolCall.tool_name}:`, error);
      get().updateToolCallStatus(toolCall.tool_call_id, {
        tool_name: toolCall.tool_name,
        input: toolCall.input,
        status: "error",
        error: `Tool execution failed: ${error instanceof Error ? error.message : "Critical error"}`,
        startTime: Date.now(),
        endTime: Date.now(),
        isExternal: true,
        component: import_react2.default.createElement("div", {
          className: "text-red-500 p-2 border border-red-200 rounded bg-red-50"
        }, `Critical tool error: ${error instanceof Error ? error.message : "Unknown error"}`)
      });
    }
  },
  hasPendingToolCalls: () => {
    const state = get();
    return Array.from(state.toolCalls.values()).some(
      (toolCall) => toolCall.status === "pending" || toolCall.status === "running"
    );
  },
  failAllPendingToolCalls: (errorMessage) => {
    set((state) => {
      const newToolCalls = new Map(state.toolCalls);
      newToolCalls.forEach((toolCall, id) => {
        if (toolCall.status === "pending" || toolCall.status === "running") {
          newToolCalls.set(id, {
            ...toolCall,
            status: "error",
            error: errorMessage,
            resultSent: true
            // Mark as processed so it doesn't block
          });
        }
      });
      return { ...state, toolCalls: newToolCalls };
    });
  },
  clearToolResults: () => {
    set((state) => {
      const newState = { ...state };
      newState.toolCalls.forEach((toolCall) => {
        if (toolCall.status === "completed" || toolCall.status === "error") {
          toolCall.resultSent = true;
        }
      });
      return newState;
    });
  },
  getExternalToolResponses: () => {
    const state = get();
    const completedToolCalls = Array.from(state.toolCalls.values()).filter(
      (toolCall) => (toolCall.status === "completed" || toolCall.status === "error") && toolCall.isExternal && toolCall.result !== void 0 && // Only return if there's actually a result
      !toolCall.resultSent
      // **FIX**: Don't return results that were already sent
    );
    return completedToolCalls.map((toolCallState) => {
      const fallbackPart = {
        part_type: "data",
        data: { result: null, error: "No result", success: false }
      };
      return {
        tool_call_id: toolCallState.tool_call_id,
        tool_name: toolCallState.tool_name,
        parts: toolCallState.result?.parts ?? [fallbackPart]
      };
    });
  },
  getToolCallById: (toolCallId) => {
    const state = get();
    return state.toolCalls.get(toolCallId) || null;
  },
  getPendingToolCalls: () => {
    const state = get();
    return Array.from(state.toolCalls.values()).filter(
      (toolCall) => toolCall.status === "pending"
    );
  },
  getCompletedToolCalls: () => {
    const state = get();
    return Array.from(state.toolCalls.values()).filter(
      (toolCall) => toolCall.status === "completed" || toolCall.status === "error"
    );
  },
  clearAllStates: () => {
    set({
      tasks: /* @__PURE__ */ new Map(),
      plans: /* @__PURE__ */ new Map(),
      steps: /* @__PURE__ */ new Map(),
      toolCalls: /* @__PURE__ */ new Map(),
      currentRunId: void 0,
      currentTaskId: void 0,
      currentPlanId: void 0,
      streamingIndicator: void 0,
      messages: [],
      isStreaming: false,
      isLoading: false,
      error: null,
      browserSessionId: void 0,
      browserViewerUrl: void 0,
      browserStreamUrl: void 0,
      todos: []
    });
  },
  // Helper to complete any running steps (for cleanup)
  completeRunningSteps: () => {
    const state = get();
    const now = Date.now();
    state.steps.forEach((step, stepId) => {
      if (step.status === "running") {
        get().updateStep(stepId, {
          status: "completed",
          endTime: now
        });
      }
    });
  },
  // Reset streaming and thinking states when streaming is stopped
  resetStreamingStates: () => {
    console.log("\u{1F504} Resetting streaming states");
    set({
      isStreaming: false,
      streamingIndicator: void 0,
      currentThought: void 0
    });
  },
  clearTask: (taskId) => {
    set((state) => {
      const newState = { ...state };
      newState.tasks.delete(taskId);
      for (const [planId, plan] of newState.plans) {
        if (plan.runId === taskId) {
          newState.plans.delete(planId);
        }
      }
      return newState;
    });
  },
  getCurrentTask: () => {
    const state = get();
    if (!state.currentTaskId) return null;
    const task = state.tasks.get(state.currentTaskId);
    return task || null;
  },
  getCurrentPlan: () => {
    const state = get();
    if (!state.currentPlanId) return null;
    return state.plans.get(state.currentPlanId) || null;
  },
  getCurrentTasks: () => {
    const state = get();
    return Array.from(state.tasks.values());
  },
  getTaskById: (taskId) => {
    const state = get();
    return state.tasks.get(taskId) || null;
  },
  getPlanById: (planId) => {
    const state = get();
    return state.plans.get(planId) || null;
  },
  updateTask: (taskId, updates) => {
    set((state) => {
      const newState = { ...state };
      const existingTask = newState.tasks.get(taskId);
      const taskToUpdate = existingTask || {
        id: taskId,
        title: updates.title ?? "Task",
        status: updates.status ?? "pending",
        toolCalls: [],
        results: []
      };
      newState.tasks.set(taskId, { ...taskToUpdate, ...updates });
      return newState;
    });
  },
  updatePlan: (planId, updates) => {
    set((state) => {
      const newState = { ...state };
      const existingPlan = newState.plans.get(planId);
      const planToUpdate = existingPlan || {
        id: planId,
        steps: [],
        status: updates.status ?? "pending"
      };
      newState.plans.set(planId, { ...planToUpdate, ...updates });
      return newState;
    });
  },
  updateStep: (stepId, updates) => {
    set((state) => {
      const newState = { ...state };
      const existingStep = newState.steps.get(stepId);
      if (existingStep) {
        newState.steps.set(stepId, { ...existingStep, ...updates });
      }
      return newState;
    });
  },
  getAllExternalTools: () => {
    const state = get();
    return state.externalTools || [];
  },
  // Setup
  setAgent: (agent) => {
    set({ agent });
  },
  setExternalTools: (tools) => {
    set({ externalTools: tools });
  },
  setWrapOptions: (wrapOptions) => {
    set({ wrapOptions });
  }
}));
var validateToolCallInput = (toolCall) => {
  const notValidJson = "Input is not a valid JSON string or object";
  if (typeof toolCall.input === "string") {
    try {
      JSON.parse(toolCall.input);
      return null;
    } catch {
      return notValidJson;
    }
  }
  return typeof toolCall.input === "object" ? null : notValidJson;
};

// src/useChat.ts
function useChat({
  threadId,
  onError,
  getMetadata,
  agent,
  externalTools,
  beforeSendMessage,
  initialMessages
}) {
  const abortControllerRef = (0, import_react3.useRef)(null);
  const onErrorRef = (0, import_react3.useRef)(onError);
  (0, import_react3.useEffect)(() => {
    onErrorRef.current = onError;
  }, [onError]);
  const getMetadataRef = (0, import_react3.useRef)(getMetadata);
  (0, import_react3.useEffect)(() => {
    getMetadataRef.current = getMetadata;
  }, [getMetadata]);
  const currentRunId = useChatStateStore((state) => state.currentRunId);
  const currentTaskId = useChatStateStore((state) => state.currentTaskId);
  const processMessage = useChatStateStore((state) => state.processMessage);
  const clearAllStates = useChatStateStore((state) => state.clearAllStates);
  const setError = useChatStateStore((state) => state.setError);
  const setLoading = useChatStateStore((state) => state.setLoading);
  const setStreaming = useChatStateStore((state) => state.setStreaming);
  const setAgent = useChatStateStore((state) => state.setAgent);
  const hasPendingToolCalls = useChatStateStore((state) => state.hasPendingToolCalls);
  const failAllPendingToolCalls = useChatStateStore((state) => state.failAllPendingToolCalls);
  const setStreamingIndicator = useChatStateStore((state) => state.setStreamingIndicator);
  const setExternalTools = useChatStateStore((state) => state.setExternalTools);
  const errorState = useChatStateStore((state) => state.error);
  const messages = useChatStateStore((state) => state.messages);
  (0, import_react3.useEffect)(() => {
    if (externalTools && externalTools.length > 0) {
      setExternalTools(externalTools);
    }
  }, [externalTools, setExternalTools]);
  const createInvokeContext = (0, import_react3.useCallback)(() => ({
    thread_id: threadId,
    run_id: currentRunId,
    task_id: currentTaskId,
    getMetadata: getMetadataRef.current
  }), [currentRunId, currentTaskId, threadId]);
  const isLoading = useChatStateStore((state) => state.isLoading);
  const isStreaming = useChatStateStore((state) => state.isStreaming);
  (0, import_react3.useEffect)(() => {
    if (initialMessages) {
      clearAllStates();
      initialMessages.forEach((message) => processMessage(message, false));
    }
  }, [clearAllStates, initialMessages, processMessage]);
  const addMessage = (0, import_react3.useCallback)((message) => {
    processMessage(message, false);
  }, [processMessage]);
  (0, import_react3.useEffect)(() => {
    if (agent) {
      setAgent(agent);
    }
  }, [agent, setAgent]);
  const cleanupRef = (0, import_react3.useRef)(void 0);
  cleanupRef.current = () => {
    setStreamingIndicator(void 0);
    setStreaming(false);
    setLoading(false);
  };
  (0, import_react3.useEffect)(() => {
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (cleanupRef.current) {
        setTimeout(cleanupRef.current, 0);
      }
    };
  }, []);
  const agentIdRef = (0, import_react3.useRef)(void 0);
  (0, import_react3.useEffect)(() => {
    if (agent?.id !== agentIdRef.current) {
      clearAllStates();
      setError(null);
      agentIdRef.current = agent?.id;
    }
  }, [agent?.id, clearAllStates, setError]);
  const handleStreamEvent = (0, import_react3.useCallback)(
    (event) => {
      processMessage(event, true);
    },
    [processMessage]
  );
  const sendMessage = (0, import_react3.useCallback)(async (content) => {
    if (!agent) return;
    setLoading(true);
    setStreaming(true);
    setError(null);
    setStreamingIndicator("typing");
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    try {
      const parts = typeof content === "string" ? [{ part_type: "text", data: content }] : content;
      let distriMessage = import_core3.DistriClient.initDistriMessage("user", parts);
      processMessage(distriMessage, false);
      if (beforeSendMessage) {
        distriMessage = await beforeSendMessage(distriMessage);
      }
      const context = createInvokeContext();
      const a2aMessage = (0, import_core4.convertDistriMessageToA2A)(distriMessage, context);
      const contextMetadata = await getMetadataRef.current?.() || {};
      const stream = await agent.invokeStream({
        message: a2aMessage,
        metadata: {
          ...contextMetadata,
          task_id: currentTaskId
        }
      }, externalTools);
      for await (const event of stream) {
        if (abortControllerRef.current?.signal.aborted) {
          break;
        }
        handleStreamEvent(event);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setStreamingIndicator(void 0);
        setStreaming(false);
        setLoading(false);
        return;
      }
      const error = err instanceof Error ? err : new Error("Failed to send message");
      setError(error);
      onErrorRef.current?.(error);
      failAllPendingToolCalls(error.message);
      setStreamingIndicator(void 0);
      setStreaming(false);
      setLoading(false);
    } finally {
      setStreamingIndicator(void 0);
      setLoading(false);
      setStreaming(false);
      abortControllerRef.current = null;
    }
  }, [agent, beforeSendMessage, createInvokeContext, currentTaskId, externalTools, handleStreamEvent, processMessage, setError, setLoading, setStreaming, setStreamingIndicator, failAllPendingToolCalls]);
  const sendMessageStream = (0, import_react3.useCallback)(async (content, role = "user") => {
    if (!agent) return;
    setLoading(true);
    setStreaming(true);
    setError(null);
    setStreamingIndicator("typing");
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    try {
      const parts = typeof content === "string" ? [{ part_type: "text", data: content }] : content;
      const distriMessage = import_core3.DistriClient.initDistriMessage(role, parts);
      processMessage(distriMessage, false);
      const context = createInvokeContext();
      const a2aMessage = (0, import_core4.convertDistriMessageToA2A)(distriMessage, context);
      const contextMetadata = await getMetadataRef.current?.() || {};
      const stream = await agent.invokeStream({
        message: a2aMessage,
        metadata: {
          ...contextMetadata,
          task_id: currentTaskId
        }
      });
      for await (const event of stream) {
        if (abortControllerRef.current?.signal.aborted) {
          break;
        }
        handleStreamEvent(event);
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        setStreamingIndicator(void 0);
        setStreaming(false);
        setLoading(false);
        return;
      }
      const error = err instanceof Error ? err : new Error("Failed to send message");
      setError(error);
      onErrorRef.current?.(error);
      failAllPendingToolCalls(error.message);
      setStreamingIndicator(void 0);
      setStreaming(false);
      setLoading(false);
    } finally {
      setStreamingIndicator(void 0);
      setLoading(false);
      setStreaming(false);
      abortControllerRef.current = null;
    }
  }, [agent, createInvokeContext, currentTaskId, handleStreamEvent, processMessage, setError, setLoading, setStreaming, setStreamingIndicator, failAllPendingToolCalls]);
  const stopStreaming = (0, import_react3.useCallback)(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);
  return {
    isStreaming,
    messages,
    sendMessage,
    sendMessageStream,
    isLoading,
    error: errorState,
    hasPendingToolCalls,
    stopStreaming,
    addMessage
  };
}

// src/useAgent.ts
var import_react7 = __toESM(require("react"), 1);
var import_core6 = require("@distri/core");

// src/DistriProvider.tsx
var import_react6 = require("react");
var import_core5 = require("@distri/core");

// src/components/ThemeProvider.tsx
var import_react4 = require("react");
var import_jsx_runtime4 = require("react/jsx-runtime");
var initialState = {
  theme: "system",
  setTheme: () => null
};
var ThemeProviderContext = (0, import_react4.createContext)(initialState);
function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "distri-theme",
  ...props
}) {
  const [theme, setTheme] = (0, import_react4.useState)(() => {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      return stored;
    }
    return defaultTheme === "system" ? "dark" : defaultTheme;
  });
  (0, import_react4.useEffect)(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark", "chatgpt");
    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      root.classList.add(systemTheme);
      return;
    }
    root.classList.add(theme);
  }, [theme]);
  const value = {
    theme,
    setTheme: (theme2) => {
      localStorage.setItem(storageKey, theme2);
      setTheme(theme2);
    }
  };
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(ThemeProviderContext.Provider, { ...props, value, children });
}
var useTheme = () => {
  const context = (0, import_react4.useContext)(ThemeProviderContext);
  if (context === void 0)
    throw new Error("useTheme must be used within a ThemeProvider");
  return context;
};

// src/DistriAuthProvider.tsx
var import_react5 = require("react");
var import_jsx_runtime5 = require("react/jsx-runtime");
var DistriAuthContext = (0, import_react5.createContext)(void 0);
function DistriAuthProvider({
  clientId,
  theme = "dark",
  children,
  debug = false,
  baseUrl = "https://api.distri.dev/v1"
}) {
  const [token, setToken] = (0, import_react5.useState)(null);
  const [error, setError] = (0, import_react5.useState)(null);
  const [status, setStatus] = (0, import_react5.useState)("idle");
  const resolversRef = (0, import_react5.useRef)([]);
  const resolveAuth = (0, import_react5.useCallback)((t) => {
    if (debug) console.log(`[DistriAuth] Resolving ${resolversRef.current.length} pending auth requests`);
    resolversRef.current.forEach((resolve) => resolve(t));
    resolversRef.current = [];
  }, [debug]);
  const requestAuth = (0, import_react5.useCallback)(() => {
    if (debug) console.log("[DistriAuth] requestAuth triggered, current status:", status);
    if (status === "authenticated" && token) {
      return Promise.resolve(token);
    }
    if (status !== "loading") {
      setStatus("loading");
    }
    setError(null);
    return new Promise((resolve) => {
      resolversRef.current.push(resolve);
    });
  }, [debug, status, token]);
  const config = (0, import_react5.useMemo)(() => ({
    clientId,
    theme,
    baseUrl,
    debug
  }), [clientId, theme, baseUrl, debug]);
  const contextValue = (0, import_react5.useMemo)(() => ({
    token,
    status,
    error,
    requestAuth,
    setToken,
    setStatus,
    setError,
    resolveAuth,
    config
  }), [token, status, error, requestAuth, resolveAuth, config]);
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(DistriAuthContext.Provider, { value: contextValue, children });
}
function useDistriAuth() {
  const context = (0, import_react5.useContext)(DistriAuthContext);
  if (!context) {
    return {
      token: null,
      status: "idle",
      error: null,
      requestAuth: async () => null,
      setToken: () => {
      },
      setStatus: () => {
      },
      setError: () => {
      },
      resolveAuth: () => {
      },
      config: { clientId: "", theme: "dark", baseUrl: "", debug: false }
    };
  }
  return context;
}

// src/DistriProvider.tsx
var import_jsx_runtime6 = require("react/jsx-runtime");
var DistriContext = (0, import_react6.createContext)({
  client: null,
  error: null,
  isLoading: true
});
function DistriProviderInner({ config, children }) {
  const authReady = config.authReady ?? true;
  const { token, status, error: authError, requestAuth } = useDistriAuth();
  const [client, setClient] = (0, import_react6.useState)(null);
  const [initError, setInitError] = (0, import_react6.useState)(null);
  const [workspaceId, setWorkspaceIdState] = (0, import_react6.useState)(config.workspaceId || null);
  (0, import_react6.useEffect)(() => {
    try {
      if (!client && authReady) {
        const currentClient = new import_core5.DistriClient({
          ...config,
          accessToken: token || config.accessToken,
          workspaceId: workspaceId || config.workspaceId,
          // If clientId is provided, we use the requestAuth logic from our provider
          onTokenRefresh: config.clientId ? requestAuth : config.onTokenRefresh
        });
        setClient(currentClient);
      }
    } catch (err) {
      console.error("[DistriProvider] Failed to initialize client:", err);
      setInitError(err instanceof Error ? err : new Error("Failed to initialize client"));
    }
  }, [config, client, requestAuth, token, authReady, workspaceId]);
  (0, import_react6.useEffect)(() => {
    const configWorkspaceId = config.workspaceId || null;
    if (configWorkspaceId !== workspaceId) {
      setWorkspaceIdState(configWorkspaceId);
      if (client) {
        client.workspaceId = configWorkspaceId || void 0;
      }
    }
  }, [config.workspaceId, client, workspaceId]);
  const setWorkspaceId = (0, import_react6.useCallback)((newWorkspaceId) => {
    setWorkspaceIdState(newWorkspaceId);
    if (client) {
      client.workspaceId = newWorkspaceId || void 0;
    }
  }, [client]);
  const isAuthInProgress = status === "loading";
  const isLoading = !client || isAuthInProgress || !authReady;
  const contextValue = (0, import_react6.useMemo)(() => ({
    client,
    error: initError || (authError ? new Error(authError) : null),
    isLoading,
    token,
    workspaceId,
    setWorkspaceId
  }), [client, initError, authError, isLoading, token, workspaceId, setWorkspaceId]);
  return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(DistriContext.Provider, { value: contextValue, children });
}
function DistriProvider(props) {
  const { config, defaultTheme = "dark" } = props;
  const content = /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(ThemeProvider, { defaultTheme, children: /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(DistriProviderInner, { ...props }) });
  if (config.clientId) {
    return /* @__PURE__ */ (0, import_jsx_runtime6.jsx)(
      DistriAuthProvider,
      {
        clientId: config.clientId,
        theme: defaultTheme === "system" ? "dark" : defaultTheme,
        debug: config.debug,
        baseUrl: config.baseUrl,
        children: content
      }
    );
  }
  return content;
}
function useDistri() {
  const context = (0, import_react6.useContext)(DistriContext);
  if (!context) {
    throw new Error("useDistri must be used within a DistriProvider");
  }
  return context;
}
function useDistriToken() {
  const { token, isLoading } = useDistri();
  return { token, isLoading };
}
function useWorkspace() {
  const { workspaceId, setWorkspaceId, isLoading } = useDistri();
  return { workspaceId, setWorkspaceId, isLoading };
}

// src/useAgent.ts
function useAgent({
  agentIdOrDef,
  enabled = true
}) {
  const { client, error: clientError, isLoading: clientLoading } = useDistri();
  const [agent, setAgent] = (0, import_react7.useState)(null);
  const [loading, setLoading] = (0, import_react7.useState)(false);
  const [error, setError] = (0, import_react7.useState)(null);
  const agentRef = (0, import_react7.useRef)(null);
  const currentAgentIdRef = (0, import_react7.useRef)(null);
  const currentClientRef = (0, import_react7.useRef)(null);
  const initializeAgent = (0, import_react7.useCallback)(async () => {
    if (!client || !agentIdOrDef) return;
    if (currentAgentIdRef.current === agentIdOrDef && agentRef.current && currentClientRef.current === client) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let newAgent;
      if (typeof agentIdOrDef === "string") {
        const agentConfig = await client.getAgent(agentIdOrDef);
        newAgent = new import_core6.Agent(agentConfig, client);
      } else {
        newAgent = new import_core6.Agent(agentIdOrDef, client);
      }
      agentRef.current = newAgent;
      currentAgentIdRef.current = agentIdOrDef;
      currentClientRef.current = client;
      setAgent(newAgent);
    } catch (err) {
      console.error("Failed to initialize agent:", err);
      const initError = err instanceof Error ? err : new Error("Failed to initialize agent");
      setError(initError);
      agentRef.current = null;
    } finally {
      setLoading(false);
    }
  }, [client, agentIdOrDef]);
  import_react7.default.useEffect(() => {
    if (!clientLoading && !clientError && client && enabled) {
      initializeAgent();
    }
  }, [clientLoading, clientError, client, agentIdOrDef, initializeAgent, enabled]);
  import_react7.default.useEffect(() => {
    if (currentAgentIdRef.current !== agentIdOrDef) {
      agentRef.current = null;
      setAgent(null);
      currentAgentIdRef.current = null;
    }
  }, [agentIdOrDef]);
  import_react7.default.useEffect(() => {
    if (currentClientRef.current !== client) {
      agentRef.current = null;
      setAgent(null);
      currentClientRef.current = null;
    }
  }, [client]);
  return {
    // Agent information
    agent,
    // State management
    loading: loading || clientLoading,
    error: error || clientError
  };
}

// src/useAgentDefinitions.ts
var import_react8 = require("react");
function useAgentDefinitions() {
  const { client, error: clientError, isLoading: clientLoading } = useDistri();
  const [agents, setAgents] = (0, import_react8.useState)([]);
  const [loading, setLoading] = (0, import_react8.useState)(true);
  const [error, setError] = (0, import_react8.useState)(null);
  const fetchAgents = (0, import_react8.useCallback)(async () => {
    if (!client) {
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const fetchedAgents = await client.getAgents();
      setAgents(fetchedAgents);
    } catch (err) {
      console.error("[useAgentDefinitions] Failed to fetch agents:", err);
      setError(err instanceof Error ? err : new Error("Failed to fetch agents"));
    } finally {
      setLoading(false);
    }
  }, [client]);
  const getAgent = (0, import_react8.useCallback)(async (agentId) => {
    if (!client) {
      throw new Error("Client not available");
    }
    try {
      const agent = await client.getAgent(agentId);
      setAgents((prev) => prev.map((a) => a.id === agentId ? agent : a));
      return agent;
    } catch (err) {
      const error2 = err instanceof Error ? err : new Error("Failed to get agent");
      setError(error2);
      throw error2;
    }
  }, [client]);
  (0, import_react8.useEffect)(() => {
    if (clientLoading) {
      setLoading(true);
      return;
    }
    if (clientError) {
      console.error("[useAgentDefinitions] Client error:", clientError);
      setError(clientError);
      setLoading(false);
      return;
    }
    if (client) {
      fetchAgents();
    } else {
      console.log("[useAgentDefinitions] No client available");
      setLoading(false);
    }
  }, [clientLoading, clientError, client, fetchAgents]);
  return {
    agents,
    loading: loading || clientLoading,
    error: error || clientError,
    refetch: fetchAgents,
    getAgent
  };
}

// src/useThreads.ts
var import_react9 = require("react");
function useThreads(options = {}) {
  const { enabled = true, initialParams = {} } = options;
  const { client, error: clientError, isLoading: clientLoading } = useDistri();
  const [threads, setThreads] = (0, import_react9.useState)([]);
  const [total, setTotal] = (0, import_react9.useState)(0);
  const [page, setPage] = (0, import_react9.useState)(1);
  const [pageSize, setPageSizeState] = (0, import_react9.useState)(initialParams.limit || 30);
  const [loading, setLoading] = (0, import_react9.useState)(true);
  const [error, setError] = (0, import_react9.useState)(null);
  const [params, setParams] = (0, import_react9.useState)({
    limit: 30,
    offset: 0,
    ...initialParams
  });
  const fetchThreads = (0, import_react9.useCallback)(async () => {
    if (!client) {
      console.error("[useThreads] Client not available");
      setError(new Error("Client not available"));
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const response = await client.getThreads(params);
      setThreads(response.threads);
      setTotal(response.total);
      setPage(response.page);
      setPageSizeState(response.page_size);
    } catch (err) {
      console.error("[useThreads] Failed to fetch threads:", err);
      setError(err instanceof Error ? err : new Error("Failed to fetch threads"));
    } finally {
      setLoading(false);
    }
  }, [client, params]);
  const fetchThread = (0, import_react9.useCallback)(async (threadId) => {
    if (!client) {
      throw new Error("Client not available");
    }
    try {
      const response = await client.getThread(threadId);
      return response;
    } catch (err) {
      console.error("[useThreads] Failed to fetch thread:", err);
      throw err;
    }
  }, [client]);
  const deleteThread = (0, import_react9.useCallback)(async (threadId) => {
    if (!client) {
      throw new Error("Client not available");
    }
    setThreads((prev) => prev.filter((t) => t.id !== threadId));
  }, [client]);
  const updateThread = (0, import_react9.useCallback)(async (threadId, localId) => {
    if (!client) {
      console.warn("Client not available for thread update");
      return;
    }
    try {
      const updatedThread = await client.getThread(threadId);
      if (updatedThread) {
        setThreads((prev) => {
          const exists = prev.some((t) => t.id === threadId);
          if (exists) {
            return prev.map(
              (thread) => thread.id === threadId ? updatedThread : thread
            );
          }
          if (localId) {
            const localIndex = prev.findIndex((t) => t.id === localId);
            if (localIndex !== -1) {
              const newThreads = [...prev];
              newThreads[localIndex] = updatedThread;
              return newThreads;
            }
          }
          return [updatedThread, ...prev];
        });
      }
    } catch (err) {
      console.warn("Failed to update thread:", err);
    }
  }, [client]);
  const nextPage = (0, import_react9.useCallback)(() => {
    const currentOffset = params.offset || 0;
    const currentLimit = params.limit || 30;
    const newOffset = currentOffset + currentLimit;
    if (newOffset < total) {
      setParams((p) => ({ ...p, offset: newOffset }));
    }
  }, [params, total]);
  const prevPage = (0, import_react9.useCallback)(() => {
    const currentOffset = params.offset || 0;
    const currentLimit = params.limit || 30;
    const newOffset = Math.max(0, currentOffset - currentLimit);
    setParams((p) => ({ ...p, offset: newOffset }));
  }, [params]);
  const goToPage = (0, import_react9.useCallback)((pageNum) => {
    const currentLimit = params.limit || 30;
    setParams((p) => ({ ...p, offset: (pageNum - 1) * currentLimit }));
  }, [params.limit]);
  const setPageSize = (0, import_react9.useCallback)((size) => {
    setParams((p) => ({ ...p, limit: size, offset: 0 }));
  }, []);
  (0, import_react9.useEffect)(() => {
    if (clientLoading) {
      setLoading(true);
      return;
    }
    if (clientError) {
      setError(clientError);
      setLoading(false);
      return;
    }
    if (client && enabled) {
      fetchThreads();
    } else {
      setLoading(false);
    }
  }, [clientLoading, clientError, client, fetchThreads, enabled]);
  return {
    threads,
    total,
    page,
    pageSize,
    loading: loading || clientLoading,
    error: error || clientError,
    params,
    setParams,
    refetch: fetchThreads,
    deleteThread,
    fetchThread,
    updateThread,
    nextPage,
    prevPage,
    goToPage,
    setPageSize
  };
}
function useAgentsByUsage(options) {
  const { client, error: clientError, isLoading: clientLoading } = useDistri();
  const [agents, setAgents] = (0, import_react9.useState)([]);
  const [loading, setLoading] = (0, import_react9.useState)(true);
  const [error, setError] = (0, import_react9.useState)(null);
  const [search, setSearch] = (0, import_react9.useState)(options?.search || "");
  const fetchAgents = (0, import_react9.useCallback)(async () => {
    if (!client) {
      setError(new Error("Client not available"));
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const result = await client.getAgentsByUsage();
      setAgents(result);
    } catch (err) {
      console.error("[useAgentsByUsage] Failed to fetch agents:", err);
      setError(err instanceof Error ? err : new Error("Failed to fetch agents"));
    } finally {
      setLoading(false);
    }
  }, [client]);
  (0, import_react9.useEffect)(() => {
    if (clientLoading) {
      setLoading(true);
      return;
    }
    if (clientError) {
      setError(clientError);
      setLoading(false);
      return;
    }
    if (client) {
      fetchAgents();
    } else {
      setLoading(false);
    }
  }, [clientLoading, clientError, client, fetchAgents]);
  return {
    agents,
    loading: loading || clientLoading,
    error: error || clientError,
    refetch: fetchAgents,
    search,
    setSearch
  };
}

// src/components/Chat.tsx
var import_react25 = require("react");

// src/components/ChatInput.tsx
var import_react12 = require("react");
var import_react13 = require("@tiptap/react");
var import_starter_kit = __toESM(require("@tiptap/starter-kit"), 1);
var import_extension_placeholder = __toESM(require("@tiptap/extension-placeholder"), 1);
var import_lucide_react4 = require("lucide-react");

// src/components/VoiceInput.tsx
var import_react11 = require("react");
var import_lucide_react3 = require("lucide-react");
var import_react_speech_recognition = __toESM(require("react-speech-recognition"), 1);

// src/hooks/useSpeechToText.ts
var import_react10 = require("react");
var useSpeechToText = () => {
  const { client } = useDistri();
  const [isTranscribing, setIsTranscribing] = (0, import_react10.useState)(false);
  const [isStreaming, setIsStreaming] = (0, import_react10.useState)(false);
  const streamingConnectionRef = (0, import_react10.useRef)(null);
  const transcribe = (0, import_react10.useCallback)(async (audioBlob, config = {}) => {
    if (!client) {
      throw new Error("DistriClient not initialized");
    }
    if (isTranscribing) {
      throw new Error("Transcription already in progress");
    }
    setIsTranscribing(true);
    try {
      const result = await client.transcribe(audioBlob, config);
      return result;
    } finally {
      setIsTranscribing(false);
    }
  }, [client, isTranscribing]);
  const startStreamingTranscription = (0, import_react10.useCallback)(async (options = {}) => {
    if (!client) {
      throw new Error("DistriClient not initialized");
    }
    if (isStreaming) {
      throw new Error("Streaming transcription already in progress");
    }
    setIsStreaming(true);
    const enhancedOptions = {
      ...options,
      onStart: () => {
        console.log("\u{1F3A4} Streaming transcription started");
        options.onStart?.();
      },
      onEnd: () => {
        console.log("\u{1F3A4} Streaming transcription ended");
        setIsStreaming(false);
        streamingConnectionRef.current = null;
        options.onEnd?.();
      },
      onError: (error) => {
        console.error("\u{1F3A4} Streaming transcription error:", error);
        setIsStreaming(false);
        streamingConnectionRef.current = null;
        options.onError?.(error);
      },
      onTranscript: (text, isFinal) => {
        console.log("\u{1F3A4} Transcript:", { text, isFinal });
        options.onTranscript?.(text, isFinal);
      }
    };
    try {
      const connection = await client.streamingTranscription(enhancedOptions);
      streamingConnectionRef.current = connection;
      return connection;
    } catch (error) {
      setIsStreaming(false);
      streamingConnectionRef.current = null;
      throw error;
    }
  }, [client, isStreaming]);
  const stopStreamingTranscription = (0, import_react10.useCallback)(() => {
    if (streamingConnectionRef.current) {
      console.log("\u{1F3A4} Stopping streaming transcription");
      streamingConnectionRef.current.stop();
      streamingConnectionRef.current.close();
      streamingConnectionRef.current = null;
    }
    setIsStreaming(false);
  }, []);
  const sendAudio = (0, import_react10.useCallback)((audioData) => {
    if (streamingConnectionRef.current) {
      streamingConnectionRef.current.sendAudio(audioData);
    } else {
      console.warn("\u{1F3A4} No active streaming connection to send audio to");
    }
  }, []);
  const sendText = (0, import_react10.useCallback)((text) => {
    if (streamingConnectionRef.current) {
      streamingConnectionRef.current.sendText(text);
    } else {
      console.warn("\u{1F3A4} No active streaming connection to send text to");
    }
  }, []);
  return {
    // Single transcription
    transcribe,
    isTranscribing,
    // Streaming transcription
    startStreamingTranscription,
    stopStreamingTranscription,
    sendAudio,
    sendText,
    isStreaming
  };
};

// src/components/VoiceInput.tsx
var import_jsx_runtime7 = require("react/jsx-runtime");
var VoiceInput = ({
  onTranscript,
  onError,
  className = "",
  disabled = false,
  language = "en-US",
  interimResults = true,
  useBrowserSpeechRecognition = true
}) => {
  const [isListening, setIsListening] = (0, import_react11.useState)(false);
  const [showModal, setShowModal] = (0, import_react11.useState)(false);
  const [interimTranscript, setInterimTranscript] = (0, import_react11.useState)("");
  const [mediaRecorder, setMediaRecorder] = (0, import_react11.useState)(null);
  const {
    transcript,
    interimTranscript: browserInterimTranscript,
    finalTranscript,
    resetTranscript,
    listening,
    browserSupportsSpeechRecognition
  } = (0, import_react_speech_recognition.useSpeechRecognition)();
  const speechToText = useSpeechToText();
  const useBrowser = useBrowserSpeechRecognition && browserSupportsSpeechRecognition;
  const canUseBackend = !useBrowser && speechToText;
  (0, import_react11.useEffect)(() => {
    if (finalTranscript && finalTranscript.trim()) {
      onTranscript(finalTranscript.trim());
      resetTranscript();
      setShowModal(false);
      setIsListening(false);
    }
  }, [finalTranscript, onTranscript, resetTranscript]);
  (0, import_react11.useEffect)(() => {
    if (useBrowser) {
      setInterimTranscript(browserInterimTranscript || transcript);
    }
  }, [browserInterimTranscript, transcript, useBrowser]);
  const startListening = (0, import_react11.useCallback)(async () => {
    if (disabled) return;
    setShowModal(true);
    setIsListening(true);
    setInterimTranscript("");
    if (useBrowser) {
      try {
        await import_react_speech_recognition.default.startListening({
          continuous: true,
          language,
          interimResults
        });
      } catch (error) {
        console.error("Speech recognition error:", error);
        onError?.("Failed to start speech recognition");
        setShowModal(false);
        setIsListening(false);
      }
    } else if (canUseBackend) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
        setMediaRecorder(recorder);
        const chunks = [];
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            chunks.push(e.data);
          }
        };
        recorder.onstop = async () => {
          const audioBlob = new Blob(chunks, { type: "audio/webm" });
          try {
            if (!speechToText) {
              throw new Error("No DistriClient available for transcription");
            }
            setInterimTranscript("Processing...");
            const transcript2 = await speechToText.transcribe(audioBlob, { model: "whisper-1" });
            if (transcript2.trim()) {
              onTranscript(transcript2.trim());
            }
            setShowModal(false);
            setIsListening(false);
            setInterimTranscript("");
          } catch (error) {
            console.error("Backend transcription error:", error);
            onError?.(`Transcription failed: ${error instanceof Error ? error.message : "Unknown error"}`);
            setShowModal(false);
            setIsListening(false);
            setInterimTranscript("");
          } finally {
            stream.getTracks().forEach((track) => track.stop());
            setMediaRecorder(null);
          }
        };
        recorder.start();
        const timeoutId = setTimeout(() => {
          if (recorder.state === "recording") {
            recorder.stop();
          }
        }, 3e4);
        recorder._timeout = timeoutId;
      } catch (error) {
        console.error("Microphone access error:", error);
        onError?.("Failed to access microphone");
        setShowModal(false);
        setIsListening(false);
      }
    } else {
      onError?.("Speech recognition is not available. Please provide a DistriClient for backend transcription.");
      setShowModal(false);
      setIsListening(false);
    }
  }, [canUseBackend, disabled, interimResults, language, onError, onTranscript, speechToText, useBrowser]);
  const stopListening = (0, import_react11.useCallback)(() => {
    if (useBrowser) {
      import_react_speech_recognition.default.stopListening();
    } else if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
      if (mediaRecorder._timeout) {
        clearTimeout(mediaRecorder._timeout);
      }
    }
    if (interimTranscript.trim() && interimTranscript !== "Processing...") {
      onTranscript(interimTranscript.trim());
    }
    setShowModal(false);
    setIsListening(false);
    setInterimTranscript("");
    resetTranscript();
  }, [useBrowser, mediaRecorder, interimTranscript, onTranscript, resetTranscript]);
  const handleCancel = (0, import_react11.useCallback)(() => {
    if (useBrowser) {
      import_react_speech_recognition.default.stopListening();
    } else if (mediaRecorder && mediaRecorder.state === "recording") {
      mediaRecorder.stop();
      if (mediaRecorder._timeout) {
        clearTimeout(mediaRecorder._timeout);
      }
    }
    setShowModal(false);
    setIsListening(false);
    setInterimTranscript("");
    resetTranscript();
  }, [useBrowser, mediaRecorder, resetTranscript]);
  (0, import_react11.useEffect)(() => {
    let timeoutId;
    if (isListening && !listening && interimTranscript.trim()) {
      timeoutId = setTimeout(() => {
        stopListening();
      }, 1e3);
    }
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [isListening, listening, interimTranscript, stopListening]);
  const isActive = isListening || listening;
  return /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)(import_jsx_runtime7.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
      "button",
      {
        onClick: isActive ? stopListening : startListening,
        disabled: disabled || (speechToText?.isTranscribing ?? false),
        className: `h-10 w-10 rounded-md transition-colors flex items-center justify-center ${isActive ? "bg-blue-600 hover:bg-blue-700 text-white animate-pulse" : "hover:bg-muted text-muted-foreground"} ${className}`,
        title: isActive ? "Click to stop recording" : useBrowser ? "Click to speak" : canUseBackend ? "Click to record for transcription" : "Speech recognition not available",
        children: speechToText?.isTranscribing ?? false ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_lucide_react3.Loader2, { className: "h-5 w-5 animate-spin" }) : isActive ? /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_lucide_react3.MicOff, { className: "h-5 w-5" }) : /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_lucide_react3.Mic, { className: "h-5 w-5" })
      }
    ),
    showModal && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "fixed inset-0 bg-black/50 flex items-center justify-center z-50", children: /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "bg-background border border-border rounded-lg p-8 max-w-md w-full mx-4 text-center", children: [
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "mb-6", children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: `w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-4 ${listening ? "bg-blue-600 animate-pulse shadow-lg shadow-blue-600/30" : "bg-muted"}`, children: /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(import_lucide_react3.Mic, { className: "h-10 w-10 text-white" }) }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("h3", { className: "text-lg font-semibold mb-2", children: listening ? "Listening..." : useBrowser ? "Click to start speaking" : "Recording for transcription..." }),
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("div", { className: "min-h-[60px] p-3 bg-muted rounded-lg text-left", children: interimTranscript ? /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("p", { className: "text-sm", children: [
          /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: listening ? "text-muted-foreground" : "text-foreground", children: interimTranscript }),
          listening && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("span", { className: "animate-pulse", children: "|" })
        ] }) : /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "text-sm text-muted-foreground italic", children: "Start speaking..." }) })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsxs)("div", { className: "flex gap-3 justify-center", children: [
        /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
          "button",
          {
            onClick: handleCancel,
            className: "px-4 py-2 text-sm border border-border rounded-md hover:bg-muted transition-colors",
            children: "Cancel"
          }
        ),
        !listening && interimTranscript.trim() && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
          "button",
          {
            onClick: stopListening,
            className: "px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors",
            children: "Send"
          }
        ),
        !listening && !interimTranscript.trim() && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
          "button",
          {
            onClick: startListening,
            className: "px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors",
            children: "Start Listening"
          }
        ),
        !useBrowser && isListening && mediaRecorder && mediaRecorder.state === "recording" && /* @__PURE__ */ (0, import_jsx_runtime7.jsx)(
          "button",
          {
            onClick: stopListening,
            className: "px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors",
            children: "Stop Recording"
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime7.jsx)("p", { className: "text-xs text-muted-foreground mt-4", children: useBrowser ? "Speak naturally. The system will automatically detect when you're finished." : "Speak clearly. Click 'Send' when finished or wait for automatic processing." })
    ] }) })
  ] });
};

// src/components/ChatInput.tsx
var import_jsx_runtime8 = require("react/jsx-runtime");
var ChatInput = ({
  value,
  onChange,
  onSend,
  onStop,
  placeholder = "Type your message\u2026",
  disabled = false,
  isStreaming = false,
  browserEnabled = false,
  browserHasSession = false,
  onToggleBrowser,
  className = "",
  attachedImages,
  onRemoveImage,
  onAddImages,
  voiceEnabled = false,
  onVoiceRecord,
  onStartStreamingVoice,
  isStreamingVoice = false,
  useSpeechRecognition: useSpeechRecognition2 = false,
  onSpeechTranscript,
  variant = "default",
  theme = "auto"
}) => {
  const fileInputRef = (0, import_react12.useRef)(null);
  const mediaRecorderRef = (0, import_react12.useRef)(null);
  const [isRecording, setIsRecording] = (0, import_react12.useState)(false);
  const [recordingTime, setRecordingTime] = (0, import_react12.useState)(0);
  const imageAttachments = (0, import_react12.useMemo)(() => attachedImages ?? [], [attachedImages]);
  const onChangeRef = (0, import_react12.useRef)(onChange);
  const handleSendRef = (0, import_react12.useRef)(() => {
  });
  const isDarkMode = theme === "dark";
  const editor = (0, import_react13.useEditor)({
    extensions: [
      import_starter_kit.default.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false
      }),
      import_extension_placeholder.default.configure({
        placeholder,
        emptyEditorClass: "is-editor-empty"
      })
    ],
    content: value,
    editable: !disabled,
    onUpdate: ({ editor: editor2 }) => {
      const text = editor2.getText();
      onChangeRef.current(text);
    },
    editorProps: {
      attributes: {
        class: "distri-editor-content outline-none h-full"
      },
      handleKeyDown: (_view, event) => {
        if (event.key === "Enter" && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
          event.preventDefault();
          handleSendRef.current();
          return true;
        }
        return false;
      }
    }
  });
  (0, import_react12.useEffect)(() => {
    if (editor) {
      editor.setEditable(!disabled);
    }
  }, [editor, disabled]);
  (0, import_react12.useEffect)(() => {
    if (editor && editor.getText() !== value) {
      editor.commands.setContent(value || "");
    }
  }, [value, editor]);
  (0, import_react12.useEffect)(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  const convertFileToBase64 = (0, import_react12.useCallback)((file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          const base64Data = reader.result.split(",")[1];
          resolve(base64Data);
        } else {
          reject(new Error("Failed to read file as base64"));
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }, []);
  const handleFileSelect = (0, import_react12.useCallback)((e) => {
    const files = e.target.files;
    if (files && files.length > 0 && onAddImages) {
      onAddImages(files);
    }
    e.target.value = "";
  }, [onAddImages]);
  const startRecording = (0, import_react12.useCallback)(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      const chunks = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
        }
      };
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(chunks, { type: "audio/webm" });
        if (onVoiceRecord) {
          onVoiceRecord(audioBlob);
        }
        stream.getTracks().forEach((track) => track.stop());
      };
      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      const timer = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1e3);
      mediaRecorder._timer = timer;
    } catch (error) {
      console.error("Error starting recording:", error);
    }
  }, [onVoiceRecord]);
  const stopRecording = (0, import_react12.useCallback)(() => {
    if (mediaRecorderRef.current && isRecording) {
      if (mediaRecorderRef.current._timer) {
        clearInterval(mediaRecorderRef.current._timer);
      }
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setRecordingTime(0);
    }
  }, [isRecording]);
  const handleVoiceToggle = (0, import_react12.useCallback)(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);
  const handleBrowserToggle = (0, import_react12.useCallback)(() => {
    if (onToggleBrowser) {
      onToggleBrowser(!browserEnabled);
    }
  }, [onToggleBrowser, browserEnabled]);
  const handleSpeechTranscript = (0, import_react12.useCallback)((transcript) => {
    onChangeRef.current(transcript);
    onSpeechTranscript?.(transcript);
  }, [onSpeechTranscript]);
  const handleSend = (0, import_react12.useCallback)(async () => {
    if (!value.trim() && imageAttachments.length === 0 || disabled || isStreaming) {
      return;
    }
    try {
      if (imageAttachments.length > 0) {
        const parts = [];
        if (value.trim()) {
          parts.push({ part_type: "text", data: value.trim() });
        }
        for (const image of imageAttachments) {
          const base64Data = await convertFileToBase64(image.file);
          parts.push({
            part_type: "image",
            data: {
              type: "bytes",
              mime_type: image.file.type,
              data: base64Data,
              name: image.name
            }
          });
        }
        onSend(parts);
      } else {
        onSend(value);
      }
      onChange("");
      editor?.commands.clearContent();
    } catch (error) {
      console.error("Error processing images:", error);
    }
  }, [value, imageAttachments, disabled, isStreaming, onSend, onChange, convertFileToBase64, editor]);
  const handleStop = () => {
    if (isStreaming && onStop) {
      onStop();
    }
  };
  (0, import_react12.useEffect)(() => {
    handleSendRef.current = handleSend;
  }, [handleSend]);
  const hasContent = value.trim().length > 0 || imageAttachments.length > 0;
  const isDisabled = disabled;
  const isHero = variant === "hero";
  const editorHeight = isHero ? "min-h-[180px]" : "min-h-[100px]";
  const toolbarButton = cn(
    "flex h-10 w-10 items-center justify-center rounded-full transition-colors",
    isDarkMode ? "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white" : "bg-black/5 text-black/60 hover:bg-black/10 hover:text-black"
  );
  const toolbarButtonActive = isDarkMode ? "bg-[var(--distri-accent,#3b82f6)]/30 text-[var(--distri-accent,#3b82f6)]" : "bg-[var(--distri-accent,#3b82f6)]/20 text-[var(--distri-accent,#3b82f6)]";
  return /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: cn("relative w-full", className), children: /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "flex flex-col w-full", children: [
    imageAttachments.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: "flex flex-wrap gap-2 mb-2 mx-1", children: imageAttachments.map((image) => /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "relative group", children: [
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
        "img",
        {
          src: image.preview,
          alt: image.name,
          className: cn(
            "w-16 h-16 object-cover rounded-lg border",
            isDarkMode ? "border-white/20" : "border-black/10"
          )
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
        "button",
        {
          type: "button",
          onClick: () => onRemoveImage?.(image.id),
          className: "absolute -top-1 -right-1 w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition",
          children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_lucide_react4.X, { className: "w-3 h-3" })
        }
      )
    ] }, image.id)) }),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
      "div",
      {
        className: cn(
          "distri-chat-input-wrapper rounded-2xl",
          isDarkMode ? "p-[1px] bg-gradient-to-r from-[var(--distri-accent,#3b82f6)]/60 via-[var(--distri-accent,#3b82f6)]/30 to-[var(--distri-accent,#3b82f6)]/60" : "border border-gray-200 shadow-sm"
        ),
        children: /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)(
          "div",
          {
            className: cn(
              "distri-chat-input rounded-2xl flex flex-col",
              isDarkMode ? "bg-[#0d0d0d]" : "bg-white"
            ),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime8.jsx)("div", { className: cn("px-4 pt-4 pb-2 flex flex-col", editorHeight), children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
                import_react13.EditorContent,
                {
                  editor,
                  className: cn(
                    "distri-editor w-full flex-1 flex flex-col [&>div]:flex-1",
                    isDarkMode ? "text-white/90" : "text-gray-900",
                    "[&_.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
                    "[&_.is-editor-empty:first-child::before]:float-left",
                    "[&_.is-editor-empty:first-child::before]:h-0",
                    "[&_.is-editor-empty:first-child::before]:pointer-events-none",
                    isDarkMode ? "[&_.is-editor-empty:first-child::before]:text-white/40" : "[&_.is-editor-empty:first-child::before]:text-gray-400",
                    "[&_.ProseMirror]:outline-none",
                    "[&_.ProseMirror]:h-full",
                    isHero ? "text-base" : "text-sm"
                  )
                }
              ) }),
              /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: cn(
                "flex items-center justify-between px-3 pb-3",
                isDarkMode ? "border-white/5" : "border-black/5"
              ), children: [
                /* @__PURE__ */ (0, import_jsx_runtime8.jsxs)("div", { className: "flex items-center gap-1", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
                    "button",
                    {
                      type: "button",
                      onClick: () => fileInputRef.current?.click(),
                      className: toolbarButton,
                      disabled,
                      title: "Attach image",
                      children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_lucide_react4.Plus, { className: "h-5 w-5" })
                    }
                  ),
                  onToggleBrowser && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
                    "button",
                    {
                      type: "button",
                      onClick: handleBrowserToggle,
                      className: cn(toolbarButton, browserEnabled && browserHasSession && toolbarButtonActive),
                      disabled,
                      title: browserEnabled ? browserHasSession ? "Browser session active" : "Browser enabled" : "Enable browser",
                      children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_lucide_react4.Globe, { className: "h-4 w-4" })
                    }
                  ),
                  voiceEnabled && !useSpeechRecognition2 && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
                    "button",
                    {
                      type: "button",
                      onClick: handleVoiceToggle,
                      className: cn(toolbarButton, isRecording && "border-red-400/60 bg-red-400/15 text-red-400"),
                      title: isRecording ? `Recording\u2026 ${recordingTime}s` : "Record voice message",
                      disabled: isStreaming || disabled,
                      children: isRecording ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_lucide_react4.MicOff, { className: "h-4 w-4" }) : /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_lucide_react4.Mic, { className: "h-4 w-4" })
                    }
                  ),
                  onStartStreamingVoice && !useSpeechRecognition2 && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
                    "button",
                    {
                      type: "button",
                      onClick: onStartStreamingVoice,
                      className: cn(toolbarButton, isStreamingVoice && toolbarButtonActive),
                      disabled: isStreaming || disabled || isRecording,
                      title: "Start streaming voice conversation",
                      children: /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_lucide_react4.Radio, { className: "h-4 w-4" })
                    }
                  ),
                  useSpeechRecognition2 && /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
                    VoiceInput,
                    {
                      onTranscript: handleSpeechTranscript,
                      disabled: isDisabled || isStreaming,
                      onError: (error) => console.error("Voice input error:", error),
                      useBrowserSpeechRecognition: true,
                      language: "en-US",
                      interimResults: true
                    }
                  )
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
                  "button",
                  {
                    type: "button",
                    onClick: () => isStreaming ? handleStop() : void handleSend(),
                    disabled: isStreaming ? false : !hasContent || isDisabled,
                    className: cn(
                      "flex h-10 w-10 items-center justify-center rounded-full transition-colors",
                      isStreaming ? "bg-amber-500 text-white hover:bg-amber-400" : hasContent ? isDarkMode ? "bg-white text-black hover:bg-white/90" : "bg-[var(--distri-accent,#3b82f6)] text-white hover:bg-[var(--distri-accent,#3b82f6)]/90" : isDarkMode ? "bg-white/10 text-white/30" : "bg-black/5 text-black/30"
                    ),
                    title: isStreaming ? "Stop" : "Send",
                    children: isStreaming ? /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_lucide_react4.Square, { className: "h-4 w-4" }) : /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(import_lucide_react4.Send, { className: "h-4 w-4" })
                  }
                )
              ] })
            ]
          }
        )
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime8.jsx)(
      "input",
      {
        ref: fileInputRef,
        type: "file",
        accept: "image/*",
        multiple: true,
        className: "hidden",
        onChange: handleFileSelect
      }
    )
  ] }) });
};

// src/components/renderers/MessageRenderer.tsx
var import_core9 = require("@distri/core");

// src/components/renderers/utils.tsx
function extractContent(message) {
  let text = "";
  let hasMarkdown = false;
  let hasCode = false;
  let hasLinks = false;
  let hasImages = false;
  let imageParts = [];
  if ("parts" in message && Array.isArray(message.parts)) {
    const distriMessage = message;
    const textParts = distriMessage.parts?.filter((p) => p.part_type === "text" && p.data)?.map((p) => p.data)?.filter((text2) => text2 && text2.trim()) || [];
    text = textParts.join(" ").trim();
    imageParts = distriMessage.parts?.filter((p) => p.part_type === "image") || [];
    if (!text) {
      const structuredParts = distriMessage.parts?.filter(
        (part) => part.part_type !== "text" && part.part_type !== "image"
      ) || [];
      if (structuredParts.length > 0) {
        text = structuredParts.map((part) => formatStructuredPart(part)).filter(Boolean).join("\n\n");
        if (text) {
          hasMarkdown = true;
          hasCode = true;
        }
      }
    }
    hasMarkdown = /[*_`#[\]()>]/.test(text);
    hasCode = /```|`/.test(text);
    hasLinks = /\[.*?\]\(.*?\)|https?:\/\/[^\s]+/.test(text);
    hasImages = /!\[.*?\]\(.*?\)/.test(text) || imageParts.length > 0;
  } else {
    text = JSON.stringify(message, null, 2);
  }
  return {
    text,
    hasMarkdown,
    hasCode,
    hasLinks,
    hasImages,
    imageParts,
    rawContent: message
  };
}
function formatStructuredPart(part) {
  switch (part.part_type) {
    case "tool_call": {
      const payload = part.data;
      const toolName = payload?.tool_name || "unknown tool";
      return `**Tool Call: ${toolName}**

\`\`\`json
${JSON.stringify(part.data, null, 2)}
\`\`\``;
    }
    case "tool_result":
      return `**Tool Result**

\`\`\`json
${JSON.stringify(part.data, null, 2)}
\`\`\``;
    case "data":
      return `\`\`\`json
${JSON.stringify(part.data, null, 2)}
\`\`\``;
    default:
      return `\`\`\`json
${JSON.stringify(part, null, 2)}
\`\`\``;
  }
}

// src/components/renderers/ImageRenderer.tsx
var import_react14 = require("react");
var import_react_dom = require("react-dom");
var import_lucide_react5 = require("lucide-react");
var import_jsx_runtime9 = require("react/jsx-runtime");
var ImageDialog = ({ src, alt, onClose }) => {
  (0, import_react14.useEffect)(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);
  (0, import_react14.useEffect)(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
    "div",
    {
      className: "fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm",
      onClick: onClose,
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
          "button",
          {
            onClick: onClose,
            className: "absolute top-4 right-4 z-50 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors",
            "aria-label": "Close",
            children: /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(import_lucide_react5.X, { className: "h-6 w-6" })
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(
          "div",
          {
            className: "relative max-w-[90vw] max-h-[90vh] p-2",
            onClick: (e) => e.stopPropagation(),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
                "img",
                {
                  src,
                  alt,
                  className: "max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
                }
              ),
              alt && alt !== "Attached image" && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "absolute bottom-0 left-0 right-0 bg-black/60 text-white text-sm p-3 rounded-b-lg text-center", children: alt })
            ]
          }
        )
      ]
    }
  );
};
var ImageRenderer = ({
  imageParts,
  className = ""
}) => {
  const [viewingImage, setViewingImage] = (0, import_react14.useState)(null);
  const handleClose = (0, import_react14.useCallback)(() => {
    setViewingImage(null);
  }, []);
  if (!imageParts || imageParts.length === 0) {
    return null;
  }
  const getImageSrc = (imageData) => {
    if ("data" in imageData) {
      return `data:${imageData.mime_type};base64,${imageData.data}`;
    } else {
      return imageData.url;
    }
  };
  const getImageAlt = (imageData) => {
    return imageData.name || "Attached image";
  };
  return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)(import_jsx_runtime9.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: `flex flex-wrap gap-3 mt-3 ${className}`, children: imageParts.map((imagePart, index) => {
      const src = getImageSrc(imagePart.data);
      const alt = getImageAlt(imagePart.data);
      return /* @__PURE__ */ (0, import_jsx_runtime9.jsxs)("div", { className: "relative group", children: [
        /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
          "img",
          {
            src,
            alt,
            className: "max-w-sm max-h-64 rounded-lg border border-border object-cover shadow-sm hover:shadow-md transition-shadow cursor-pointer",
            onClick: () => setViewingImage({ src, alt })
          }
        ),
        imagePart.data.name && /* @__PURE__ */ (0, import_jsx_runtime9.jsx)("div", { className: "absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs p-2 rounded-b-lg opacity-0 group-hover:opacity-100 transition-opacity", children: imagePart.data.name })
      ] }, index);
    }) }),
    viewingImage && (0, import_react_dom.createPortal)(
      /* @__PURE__ */ (0, import_jsx_runtime9.jsx)(
        ImageDialog,
        {
          src: viewingImage.src,
          alt: viewingImage.alt,
          onClose: handleClose
        }
      ),
      document.body
    )
  ] });
};

// src/components/renderers/TextRenderer.tsx
var import_react_markdown = __toESM(require("react-markdown"), 1);
var import_react_syntax_highlighter = require("react-syntax-highlighter");
var import_prism = require("react-syntax-highlighter/dist/esm/styles/prism");
var import_remark_gfm = __toESM(require("remark-gfm"), 1);
var import_rehype_raw = __toESM(require("rehype-raw"), 1);
var import_rehype_sanitize = __toESM(require("rehype-sanitize"), 1);
var import_jsx_runtime10 = require("react/jsx-runtime");
var markdownSanitizeOptions = {
  ...import_rehype_sanitize.defaultSchema,
  attributes: {
    ...import_rehype_sanitize.defaultSchema.attributes,
    code: [
      ...import_rehype_sanitize.defaultSchema.attributes?.code ?? [],
      ["className"]
    ],
    span: [
      ...import_rehype_sanitize.defaultSchema.attributes?.span ?? [],
      ["className"]
    ],
    div: [
      ...import_rehype_sanitize.defaultSchema.attributes?.div ?? [],
      ["className"]
    ]
  }
};
var TextRenderer = ({ content, className = "" }) => {
  const { text } = content;
  return /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: `prose prose-sm max-w-none overflow-hidden break-words ${className}`, style: { wordBreak: "break-word", overflowWrap: "break-word" }, children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
    import_react_markdown.default,
    {
      rehypePlugins: [import_rehype_raw.default, [import_rehype_sanitize.default, markdownSanitizeOptions]],
      remarkPlugins: [import_remark_gfm.default],
      remarkRehypeOptions: { passThrough: ["link"] },
      components: {
        code: ({ className: codeClassName, children }) => {
          const match = /language-(\w+)/.exec(codeClassName || "");
          const language = match ? match[1] : "";
          const isInline = !match;
          return !isInline && language ? /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("div", { className: "w-full max-w-full overflow-hidden", style: { maxWidth: "100%" }, children: /* @__PURE__ */ (0, import_jsx_runtime10.jsx)(
            import_react_syntax_highlighter.Prism,
            {
              style: import_prism.vscDarkPlus,
              language,
              PreTag: "div",
              className: "!mt-0 !mb-0 text-sm",
              wrapLongLines: true,
              customStyle: {
                wordBreak: "break-all",
                overflowWrap: "break-word",
                whiteSpace: "pre-wrap",
                maxWidth: "100%",
                width: "100%",
                overflow: "hidden"
              },
              children: String(children).replace(/\n$/, "")
            }
          ) }) : /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("code", { className: "px-1 py-0.5 rounded text-sm font-mono", children });
        },
        p: ({ children }) => /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("p", { className: "mb-2 last:mb-0", children }),
        ul: ({ children }) => /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("ul", { className: "list-disc list-inside mb-2", children }),
        ol: ({ children }) => /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("ol", { className: "list-decimal list-inside mb-2", children }),
        blockquote: ({ children }) => /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("blockquote", { className: "border-l-4 border-gray-300 pl-4 italic text-gray-600", children }),
        h1: ({ children }) => /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("h1", { className: "text-lg font-bold mb-2", children }),
        h2: ({ children }) => /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("h2", { className: "text-base font-bold mb-2", children }),
        h3: ({ children }) => /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("h3", { className: "text-sm font-bold mb-1", children }),
        h4: ({ children }) => /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("h4", { className: "text-sm font-semibold mb-1", children }),
        h5: ({ children }) => /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("h5", { className: "text-xs font-semibold mb-1", children }),
        h6: ({ children }) => /* @__PURE__ */ (0, import_jsx_runtime10.jsx)("h6", { className: "text-xs font-semibold mb-1", children })
      },
      children: text
    }
  ) });
};
var TextRenderer_default = TextRenderer;

// src/components/renderers/UserMessageRenderer.tsx
var import_jsx_runtime11 = require("react/jsx-runtime");
var UserMessageRenderer = ({
  message,
  className = ""
}) => {
  const content = extractContent(message);
  return /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: `py-3 ${className}`, children: /* @__PURE__ */ (0, import_jsx_runtime11.jsx)("div", { className: "flex justify-end", children: /* @__PURE__ */ (0, import_jsx_runtime11.jsxs)("div", { className: "max-w-[80%] bg-muted/60 text-foreground rounded-2xl px-4 py-3 border", children: [
    content.text && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(TextRenderer_default, { content }),
    content.imageParts && content.imageParts.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime11.jsx)(ImageRenderer, { imageParts: content.imageParts })
  ] }) }) });
};

// src/components/renderers/StepBasedRenderer.tsx
var import_core7 = require("@distri/core");

// src/components/renderers/StreamingTextRenderer.tsx
var import_react15 = require("react");
var import_react_markdown2 = __toESM(require("react-markdown"), 1);
var import_react_syntax_highlighter2 = require("react-syntax-highlighter");
var import_prism2 = require("react-syntax-highlighter/dist/esm/styles/prism");
var import_remark_gfm2 = __toESM(require("remark-gfm"), 1);
var import_rehype_raw2 = __toESM(require("rehype-raw"), 1);
var import_rehype_sanitize2 = __toESM(require("rehype-sanitize"), 1);
var import_jsx_runtime12 = require("react/jsx-runtime");
var markdownSanitizeOptions2 = {
  ...import_rehype_sanitize2.defaultSchema,
  attributes: {
    ...import_rehype_sanitize2.defaultSchema.attributes,
    code: [
      ...import_rehype_sanitize2.defaultSchema.attributes?.code ?? [],
      ["className"]
    ],
    span: [
      ...import_rehype_sanitize2.defaultSchema.attributes?.span ?? [],
      ["className"]
    ],
    div: [
      ...import_rehype_sanitize2.defaultSchema.attributes?.div ?? [],
      ["className"]
    ]
  }
};
function processAgentResponseBlocks(text) {
  if (!text) return text;
  let processed = text;
  processed = processed.replace(/<agent_response[^>]*>\s*<\/agent_response>/gi, "");
  processed = processed.replace(/<agent_response[^>]*>\s*$/gi, "");
  processed = processed.replace(/^\s*<\/agent_response>/gi, "");
  const agentResponseRegex = /<agent_response[^>]*>([\s\S]*?)<\/agent_response>/gi;
  processed = processed.replace(agentResponseRegex, (_match, content) => {
    const thoughtMatches = content.match(/<thought[^>]*>([\s\S]*?)<\/thought>/gi);
    if (thoughtMatches) {
      const thoughtContent = thoughtMatches.map((thoughtMatch) => {
        const thoughtText = thoughtMatch.replace(/<\/?thought[^>]*>/gi, "").trim();
        if (thoughtText) {
          return `<thought>
${thoughtText}
</thought>`;
        }
        return "";
      }).filter(Boolean).join("\n\n");
      return thoughtContent;
    }
    return "";
  });
  processed = processed.replace(/<\/?agent_response[^>]*>/gi, "");
  processed = processed.replace(/\n\s*\n\s*\n/g, "\n\n").trim();
  return processed;
}
var StreamingTextRenderer = ({
  text,
  isStreaming = false,
  className = ""
}) => {
  const renderedContent = (0, import_react15.useMemo)(() => {
    const cleanedText = processAgentResponseBlocks(text);
    if (!cleanedText.trim()) {
      return null;
    }
    return /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: `prose prose-sm max-w-none overflow-hidden break-words ${className}`, style: { wordBreak: "break-word", overflowWrap: "break-word" }, children: /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
      import_react_markdown2.default,
      {
        rehypePlugins: [import_rehype_raw2.default, [import_rehype_sanitize2.default, markdownSanitizeOptions2]],
        remarkPlugins: [import_remark_gfm2.default],
        remarkRehypeOptions: {
          passThrough: ["link"],
          allowDangerousHtml: true
        },
        components: {
          // Handle custom AI tags - cast to any to bypass TypeScript component restrictions
          thought: ({ children }) => /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("span", { className: "inline-flex items-start gap-1", children: [
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "text-muted-foreground", children: "\u{1F4AD}" }),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "text-foreground", children })
          ] }),
          thinking: ({ children }) => /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "border-l-4 border-blue-400/30 pl-4 my-3 bg-blue-50/20 p-3 rounded-r-md", children: [
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "text-sm text-blue-600 font-medium mb-1", children: "\u{1F914} Processing" }),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "text-sm text-muted-foreground italic", children })
          ] }),
          action: ({ children }) => /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "border-l-4 border-green-400/30 pl-4 my-3 bg-green-50/20 p-3 rounded-r-md", children: [
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "text-sm text-green-600 font-medium mb-1", children: "\u26A1 Action" }),
            /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "text-sm text-muted-foreground", children })
          ] }),
          code: ({ className: codeClassName, children }) => {
            const match = /language-(\w+)/.exec(codeClassName || "");
            const language = match ? match[1] : "";
            const isInline = !match;
            return !isInline && language ? /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "w-full max-w-full overflow-hidden", style: { maxWidth: "100%" }, children: /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
              import_react_syntax_highlighter2.Prism,
              {
                style: import_prism2.vscDarkPlus,
                language,
                PreTag: "div",
                className: "!mt-0 !mb-0 rounded-md text-sm",
                wrapLongLines: true,
                customStyle: {
                  wordBreak: "break-all",
                  overflowWrap: "break-word",
                  whiteSpace: "pre-wrap",
                  maxWidth: "100%",
                  width: "100%",
                  overflow: "hidden"
                },
                children: String(children).replace(/\n$/, "")
              }
            ) }) : /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("code", { className: "bg-muted px-2 py-1 rounded text-sm font-mono text-foreground", children });
          },
          p: ({ children }) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("p", { className: "mb-4 last:mb-0 leading-relaxed text-foreground", children }),
          ul: ({ children }) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("ul", { className: "list-disc list-inside mb-4 space-y-1 text-foreground", children }),
          ol: ({ children }) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("ol", { className: "list-decimal list-inside mb-4 space-y-1 text-foreground", children }),
          blockquote: ({ children }) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("blockquote", { className: "border-l-4 border-border pl-4 italic text-muted-foreground my-3", children }),
          h1: ({ children }) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("h1", { className: "text-xl font-bold mb-4 text-foreground", children }),
          h2: ({ children }) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("h2", { className: "text-lg font-bold mb-4 text-foreground", children }),
          h3: ({ children }) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("h3", { className: "text-base font-bold mb-4 text-foreground", children }),
          h4: ({ children }) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("h4", { className: "text-sm font-semibold mb-4 text-foreground", children }),
          h5: ({ children }) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("h5", { className: "text-sm font-semibold mb-1 text-foreground", children }),
          h6: ({ children }) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("h6", { className: "text-xs font-semibold mb-1 text-foreground", children }),
          strong: ({ children }) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("strong", { className: "font-semibold text-foreground", children }),
          em: ({ children }) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("em", { className: "italic text-foreground", children }),
          pre: ({ children }) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("pre", { className: "w-full bg-muted border border-border rounded-md p-3 overflow-x-auto break-words whitespace-pre-wrap mb-4 block", children }),
          table: ({ children }) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "overflow-x-auto mb-4", children: /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("table", { className: "min-w-full border-collapse border border-border", children }) }),
          th: ({ children }) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("th", { className: "border border-border px-3 py-2 bg-muted font-semibold text-left", children }),
          td: ({ children }) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("td", { className: "border border-border px-3 py-2", children }),
          a: ({ children, href }) => /* @__PURE__ */ (0, import_jsx_runtime12.jsx)(
            "a",
            {
              href,
              className: "text-primary underline hover:no-underline",
              target: "_blank",
              rel: "noopener noreferrer",
              children
            }
          )
        },
        children: cleanedText
      }
    ) });
  }, [text, className]);
  if (!renderedContent) {
    return null;
  }
  return /* @__PURE__ */ (0, import_jsx_runtime12.jsxs)("div", { className: "relative", children: [
    /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("div", { className: "transition-all duration-200 ease-out", children: renderedContent }),
    isStreaming && /* @__PURE__ */ (0, import_jsx_runtime12.jsx)("span", { className: "inline-block w-0.5 h-4 bg-primary animate-pulse ml-1 transition-opacity duration-200" })
  ] });
};

// src/components/renderers/AssistantMessageRenderer.tsx
var import_jsx_runtime13 = require("react/jsx-runtime");
var AssistantMessageRenderer = ({
  message,
  className = ""
}) => {
  const steps = useChatStateStore((state) => state.steps);
  const content = extractContent(message);
  const stepId = message.step_id;
  const step = stepId ? steps.get(stepId) : null;
  const isStreaming = step?.status === "running";
  return /* @__PURE__ */ (0, import_jsx_runtime13.jsxs)("div", { className: `${className} w-full`, children: [
    content.text && (isStreaming ? /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(
      StreamingTextRenderer,
      {
        text: content.text,
        isStreaming
      }
    ) : /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(TextRenderer_default, { content })),
    content.imageParts && content.imageParts.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime13.jsx)(ImageRenderer, { imageParts: content.imageParts })
  ] });
};

// src/components/renderers/ThinkingRenderer.tsx
var import_jsx_runtime14 = require("react/jsx-runtime");
var LoadingShimmer = ({ text, className }) => {
  return /* @__PURE__ */ (0, import_jsx_runtime14.jsxs)("div", { className: `w-full ${className || ""}`, children: [
    /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("span", { className: "font-medium text-shimmer", children: text }),
    /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("style", { children: `
          @keyframes shimmer {
            0% { background-position: -150% 0; }
            100% { background-position: 150% 0; }
          }
          .text-shimmer {
            background: linear-gradient(90deg, hsl(var(--muted-foreground)) 0%, hsl(var(--primary)) 50%, hsl(var(--muted-foreground)) 100%);
            background-size: 150% 100%;
            background-clip: text;
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            animation: shimmer 2s ease-in-out infinite;
          }
        ` })
  ] });
};
var ThinkingRenderer = ({
  className = ""
}) => {
  const component = LoadingShimmer({ text: "Thinking..." });
  return /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { className: `flex items-start gap-3 py-3 ${className}`, children: /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { className: "w-full", children: /* @__PURE__ */ (0, import_jsx_runtime14.jsx)("div", { className: "flex items-center gap-2 text-sm text-muted-foreground", children: component }) }) });
};

// src/components/renderers/MessageFeedback.tsx
var import_react17 = require("react");
var import_lucide_react6 = require("lucide-react");

// src/hooks/useMessageFeedback.ts
var import_react16 = require("react");
function useMessageReadStatus(options) {
  const { threadId, messageId, autoFetch = false } = options;
  const { client } = useDistri();
  const [readStatus, setReadStatus] = (0, import_react16.useState)(null);
  const [loading, setLoading] = (0, import_react16.useState)(autoFetch);
  const [error, setError] = (0, import_react16.useState)(null);
  const refetch = (0, import_react16.useCallback)(async () => {
    if (!client) {
      setError(new Error("Client not available"));
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const status = await client.getMessageReadStatus(threadId, messageId);
      setReadStatus(status);
    } catch (err) {
      console.error("[useMessageReadStatus] Failed to fetch read status:", err);
      setError(err instanceof Error ? err : new Error("Failed to fetch read status"));
    } finally {
      setLoading(false);
    }
  }, [client, threadId, messageId]);
  const markAsRead = (0, import_react16.useCallback)(async () => {
    if (!client) {
      setError(new Error("Client not available"));
      return null;
    }
    try {
      setLoading(true);
      setError(null);
      const status = await client.markMessageRead(threadId, messageId);
      setReadStatus(status);
      return status;
    } catch (err) {
      console.error("[useMessageReadStatus] Failed to mark message as read:", err);
      setError(err instanceof Error ? err : new Error("Failed to mark message as read"));
      return null;
    } finally {
      setLoading(false);
    }
  }, [client, threadId, messageId]);
  return {
    readStatus,
    loading,
    error,
    markAsRead,
    refetch
  };
}
function useThreadReadStatus(options) {
  const { threadId, enabled = true } = options;
  const { client } = useDistri();
  const [readStatuses, setReadStatuses] = (0, import_react16.useState)([]);
  const [loading, setLoading] = (0, import_react16.useState)(enabled);
  const [error, setError] = (0, import_react16.useState)(null);
  const refetch = (0, import_react16.useCallback)(async () => {
    if (!client) {
      setError(new Error("Client not available"));
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const statuses = await client.getThreadReadStatus(threadId);
      setReadStatuses(statuses);
    } catch (err) {
      console.error("[useThreadReadStatus] Failed to fetch read statuses:", err);
      setError(err instanceof Error ? err : new Error("Failed to fetch read statuses"));
    } finally {
      setLoading(false);
    }
  }, [client, threadId]);
  const isRead = (0, import_react16.useCallback)(
    (messageId) => {
      return readStatuses.some((status) => status.message_id === messageId);
    },
    [readStatuses]
  );
  const markAsRead = (0, import_react16.useCallback)(
    async (messageId) => {
      if (!client) {
        setError(new Error("Client not available"));
        return null;
      }
      try {
        const status = await client.markMessageRead(threadId, messageId);
        setReadStatuses((prev) => {
          const exists = prev.some((s) => s.message_id === messageId);
          if (exists) {
            return prev.map((s) => s.message_id === messageId ? status : s);
          }
          return [...prev, status];
        });
        return status;
      } catch (err) {
        console.error("[useThreadReadStatus] Failed to mark message as read:", err);
        setError(err instanceof Error ? err : new Error("Failed to mark message as read"));
        return null;
      }
    },
    [client, threadId]
  );
  return {
    readStatuses,
    loading,
    error,
    isRead,
    markAsRead,
    refetch
  };
}
function useMessageVote(options) {
  const { threadId, messageId, autoFetch = false } = options;
  const { client } = useDistri();
  const [summary, setSummary] = (0, import_react16.useState)(null);
  const [loading, setLoading] = (0, import_react16.useState)(autoFetch);
  const [error, setError] = (0, import_react16.useState)(null);
  const refetch = (0, import_react16.useCallback)(async () => {
    if (!client) {
      setError(new Error("Client not available"));
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const voteSummary = await client.getMessageVoteSummary(threadId, messageId);
      setSummary(voteSummary);
    } catch (err) {
      console.error("[useMessageVote] Failed to fetch vote summary:", err);
      setError(err instanceof Error ? err : new Error("Failed to fetch vote summary"));
    } finally {
      setLoading(false);
    }
  }, [client, threadId, messageId]);
  const vote = (0, import_react16.useCallback)(
    async (voteType, comment) => {
      if (!client) {
        setError(new Error("Client not available"));
        return null;
      }
      try {
        setLoading(true);
        setError(null);
        const request = { vote_type: voteType, comment };
        const result = await client.voteMessage(threadId, messageId, request);
        setSummary((prev) => {
          if (!prev) {
            return {
              message_id: messageId,
              upvotes: voteType === "upvote" ? 1 : 0,
              downvotes: voteType === "downvote" ? 1 : 0,
              user_vote: voteType
            };
          }
          const wasUpvote = prev.user_vote === "upvote";
          const wasDownvote = prev.user_vote === "downvote";
          const isUpvote = voteType === "upvote";
          return {
            ...prev,
            upvotes: prev.upvotes + (isUpvote ? 1 : 0) - (wasUpvote ? 1 : 0),
            downvotes: prev.downvotes + (isUpvote ? 0 : 1) - (wasDownvote ? 1 : 0),
            user_vote: voteType
          };
        });
        return result;
      } catch (err) {
        console.error("[useMessageVote] Failed to vote:", err);
        setError(err instanceof Error ? err : new Error("Failed to vote"));
        return null;
      } finally {
        setLoading(false);
      }
    },
    [client, threadId, messageId]
  );
  const upvote = (0, import_react16.useCallback)(() => vote("upvote"), [vote]);
  const downvote = (0, import_react16.useCallback)(
    (comment) => {
      if (!comment || comment.trim() === "") {
        setError(new Error("Downvotes require a comment"));
        return Promise.resolve(null);
      }
      return vote("downvote", comment);
    },
    [vote]
  );
  const removeVote = (0, import_react16.useCallback)(async () => {
    if (!client) {
      setError(new Error("Client not available"));
      return;
    }
    try {
      setLoading(true);
      setError(null);
      await client.removeVote(threadId, messageId);
      setSummary((prev) => {
        if (!prev) return prev;
        const wasUpvote = prev.user_vote === "upvote";
        const wasDownvote = prev.user_vote === "downvote";
        return {
          ...prev,
          upvotes: prev.upvotes - (wasUpvote ? 1 : 0),
          downvotes: prev.downvotes - (wasDownvote ? 1 : 0),
          user_vote: void 0
        };
      });
    } catch (err) {
      console.error("[useMessageVote] Failed to remove vote:", err);
      setError(err instanceof Error ? err : new Error("Failed to remove vote"));
    } finally {
      setLoading(false);
    }
  }, [client, threadId, messageId]);
  return {
    summary,
    loading,
    error,
    upvote,
    downvote,
    removeVote,
    refetch
  };
}
function useMessageVotes(options) {
  const { threadId, messageId, enabled = false } = options;
  const { client } = useDistri();
  const [votes, setVotes] = (0, import_react16.useState)([]);
  const [loading, setLoading] = (0, import_react16.useState)(enabled);
  const [error, setError] = (0, import_react16.useState)(null);
  const refetch = (0, import_react16.useCallback)(async () => {
    if (!client) {
      setError(new Error("Client not available"));
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const result = await client.getMessageVotes(threadId, messageId);
      setVotes(result);
    } catch (err) {
      console.error("[useMessageVotes] Failed to fetch votes:", err);
      setError(err instanceof Error ? err : new Error("Failed to fetch votes"));
    } finally {
      setLoading(false);
    }
  }, [client, threadId, messageId]);
  return {
    votes,
    loading,
    error,
    refetch
  };
}

// src/components/renderers/MessageFeedback.tsx
var import_jsx_runtime15 = require("react/jsx-runtime");
var MessageFeedback = ({
  threadId,
  messageId,
  compact = true,
  className,
  onVote
}) => {
  const [showCommentInput, setShowCommentInput] = (0, import_react17.useState)(false);
  const [comment, setComment] = (0, import_react17.useState)("");
  const [pendingDownvote, setPendingDownvote] = (0, import_react17.useState)(false);
  const {
    summary,
    loading,
    error,
    upvote,
    downvote,
    removeVote,
    refetch
  } = useMessageVote({ threadId, messageId, autoFetch: false });
  (0, import_react17.useEffect)(() => {
    refetch();
  }, [refetch]);
  const handleUpvote = (0, import_react17.useCallback)(async () => {
    if (loading) return;
    if (summary?.user_vote === "upvote") {
      await removeVote();
    } else {
      const result = await upvote();
      if (result && onVote) {
        onVote("upvote");
      }
    }
  }, [loading, summary, upvote, removeVote, onVote]);
  const handleDownvoteClick = (0, import_react17.useCallback)(() => {
    if (loading) return;
    if (summary?.user_vote === "downvote") {
      removeVote();
      return;
    }
    setPendingDownvote(true);
    setShowCommentInput(true);
  }, [loading, summary, removeVote]);
  const handleDownvoteSubmit = (0, import_react17.useCallback)(async () => {
    if (!comment.trim()) return;
    const result = await downvote(comment.trim());
    if (result) {
      setShowCommentInput(false);
      setComment("");
      setPendingDownvote(false);
      if (onVote) {
        onVote("downvote", comment.trim());
      }
    }
  }, [comment, downvote, onVote]);
  const handleCancelDownvote = (0, import_react17.useCallback)(() => {
    setShowCommentInput(false);
    setComment("");
    setPendingDownvote(false);
  }, []);
  const isUpvoted = summary?.user_vote === "upvote";
  const isDownvoted = summary?.user_vote === "downvote";
  return /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: cn("flex flex-col gap-2", className), children: [
    /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "flex items-center gap-1", children: [
      /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)(
        "button",
        {
          onClick: handleUpvote,
          disabled: loading,
          className: cn(
            "inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors",
            "hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
            isUpvoted ? "text-green-600 bg-green-50 dark:bg-green-950/30 dark:text-green-400" : "text-muted-foreground hover:text-foreground",
            loading && "opacity-50 cursor-not-allowed"
          ),
          title: isUpvoted ? "Remove upvote" : "Upvote this response",
          "aria-label": isUpvoted ? "Remove upvote" : "Upvote",
          "aria-pressed": isUpvoted,
          children: [
            loading ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(import_lucide_react6.Loader2, { className: "h-3.5 w-3.5 animate-spin" }) : /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(import_lucide_react6.ThumbsUp, { className: cn("h-3.5 w-3.5", isUpvoted && "fill-current") }),
            !compact && summary && summary.upvotes > 0 && /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: summary.upvotes })
          ]
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)(
        "button",
        {
          onClick: handleDownvoteClick,
          disabled: loading,
          className: cn(
            "inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors",
            "hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
            isDownvoted || pendingDownvote ? "text-red-600 bg-red-50 dark:bg-red-950/30 dark:text-red-400" : "text-muted-foreground hover:text-foreground",
            loading && "opacity-50 cursor-not-allowed"
          ),
          title: isDownvoted ? "Remove downvote" : "Downvote this response",
          "aria-label": isDownvoted ? "Remove downvote" : "Downvote",
          "aria-pressed": isDownvoted,
          children: [
            loading ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(import_lucide_react6.Loader2, { className: "h-3.5 w-3.5 animate-spin" }) : /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(import_lucide_react6.ThumbsDown, { className: cn("h-3.5 w-3.5", isDownvoted && "fill-current") }),
            !compact && summary && summary.downvotes > 0 && /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: summary.downvotes })
          ]
        }
      )
    ] }),
    showCommentInput && /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "flex flex-col gap-2 p-3 bg-muted/50 rounded-lg border border-border/50", children: [
      /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "flex items-center gap-2 text-xs text-muted-foreground", children: [
        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(import_lucide_react6.MessageSquare, { className: "h-3.5 w-3.5" }),
        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("span", { children: "Please tell us what was wrong with this response" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
        "textarea",
        {
          value: comment,
          onChange: (e) => setComment(e.target.value),
          placeholder: "e.g., The response was inaccurate because...",
          className: cn(
            "w-full min-h-[60px] px-3 py-2 text-sm rounded-md border border-input",
            "bg-background placeholder:text-muted-foreground",
            "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
            "resize-none"
          ),
          autoFocus: true
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime15.jsxs)("div", { className: "flex items-center gap-2 justify-end", children: [
        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
          "button",
          {
            onClick: handleCancelDownvote,
            className: cn(
              "px-3 py-1.5 text-xs rounded-md",
              "text-muted-foreground hover:text-foreground hover:bg-muted",
              "transition-colors"
            ),
            children: "Cancel"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(
          "button",
          {
            onClick: handleDownvoteSubmit,
            disabled: !comment.trim() || loading,
            className: cn(
              "px-3 py-1.5 text-xs rounded-md",
              "bg-primary text-primary-foreground",
              "hover:bg-primary/90 transition-colors",
              "disabled:opacity-50 disabled:cursor-not-allowed"
            ),
            children: loading ? /* @__PURE__ */ (0, import_jsx_runtime15.jsx)(import_lucide_react6.Loader2, { className: "h-3 w-3 animate-spin" }) : "Submit Feedback"
          }
        )
      ] })
    ] }),
    error && /* @__PURE__ */ (0, import_jsx_runtime15.jsx)("div", { className: "text-xs text-destructive", children: error.message })
  ] });
};

// src/components/renderers/StepBasedRenderer.tsx
var import_lucide_react7 = require("lucide-react");
var import_jsx_runtime16 = require("react/jsx-runtime");
var StepIndicator = ({ step }) => {
  const getStatusIcon2 = () => {
    switch (step.status) {
      case "running":
        return /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("div", { className: "animate-spin rounded-full h-3 w-3 border-b-2 border-primary" });
      case "completed":
        return /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(import_lucide_react7.CheckCircle, { className: "h-3 w-3 text-green-500" });
      case "failed":
        return /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(import_lucide_react7.AlertCircle, { className: "h-3 w-3 text-red-500" });
      default:
        return /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(import_lucide_react7.Clock, { className: "h-3 w-3 text-muted-foreground" });
    }
  };
  const getStatusText = () => {
    switch (step.status) {
      case "running":
        return step.title || "AI is writing...";
      case "completed":
        return null;
      // Don't show completed text, just the checkmark
      case "failed":
        return "Error occurred";
      default:
        return "Pending";
    }
  };
  const renderShimmerForRunning = () => {
    if (step.status !== "running") return null;
    const text = step.title || "AI is writing...";
    return /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(LoadingShimmer, { text, className: "text-sm" });
  };
  const getDuration = () => {
    if (step.startTime) {
      const endTime = step.endTime || Date.now();
      const duration = (endTime - step.startTime) / 1e3;
      return duration < 1 ? "< 1s" : `${duration.toFixed(1)}s`;
    }
    return "";
  };
  if (step.status === "completed") {
    return /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "flex items-center gap-2 text-xs text-muted-foreground mb-1 opacity-60", children: [
      getStatusIcon2(),
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { className: "font-medium", children: step.title }),
      /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("span", { children: [
        "(",
        getDuration(),
        ")"
      ] })
    ] });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "flex items-center gap-2 text-sm text-muted-foreground mb-3", children: [
    getStatusIcon2(),
    step.status === "running" ? renderShimmerForRunning() : /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { className: "font-medium", children: getStatusText() })
  ] });
};
var StepBasedRenderer = ({
  message,
  threadId,
  enableFeedback = false
}) => {
  const steps = useChatStateStore((state) => state.steps);
  if (!(0, import_core7.isDistriMessage)(message)) {
    return null;
  }
  const distriMessage = message;
  const stepId = distriMessage.step_id;
  const step = stepId ? steps.get(stepId) : null;
  if (distriMessage.role === "user") {
    return /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(UserMessageRenderer, { message: distriMessage });
  }
  if (distriMessage.role === "assistant") {
    const showFeedback = enableFeedback && threadId && distriMessage.id && step?.status !== "running";
    return /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("div", { className: "flex items-start gap-4", children: /* @__PURE__ */ (0, import_jsx_runtime16.jsxs)("div", { className: "w-full", children: [
      (distriMessage.agent_id || distriMessage.agent_name) && /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("div", { className: "mb-2", children: /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("span", { className: "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-primary/10 text-primary border border-primary/20", children: distriMessage.agent_name || distriMessage.agent_id }) }),
      step && /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(StepIndicator, { step }),
      /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("div", { className: "transition-all duration-200 ease-in-out", children: /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(AssistantMessageRenderer, { message: distriMessage }) }),
      showFeedback && /* @__PURE__ */ (0, import_jsx_runtime16.jsx)("div", { className: "mt-3 pt-2 border-t border-border/30", children: /* @__PURE__ */ (0, import_jsx_runtime16.jsx)(
        MessageFeedback,
        {
          threadId,
          messageId: distriMessage.id,
          compact: true
        }
      ) })
    ] }) });
  }
  return null;
};

// src/components/renderers/ToolExecutionRenderer.tsx
var import_react18 = require("react");
var import_lucide_react8 = require("lucide-react");
var import_core8 = require("@distri/core");
var import_jsx_runtime17 = require("react/jsx-runtime");
var getFriendlyToolMessage = (toolName, input) => {
  switch (toolName) {
    case "search":
      return `Searching "${input?.query || "unknown query"}"`;
    case "call_search_agent":
      return `Searching`;
    case "read_values":
      return `Reading values`;
    case "get_sheet_info":
      return `Getting sheet info`;
    case "get_context_pack":
      return `Understanding the spreadsheet`;
    case "write_values":
      return `Updating values`;
    case "clear_values":
      return `Clearing values`;
    case "merge_cells":
      return `Merging cells`;
    case "call_blink_ops_agent":
      return `Planning sheet updates`;
    case "apply_blink_ops":
      return `Applying sheet updates`;
    default:
      return `Executing ${toolName}`;
  }
};
var ToolCallCard = ({ toolCall, state, renderResultData }) => {
  const [isExpanded, setIsExpanded] = (0, import_react18.useState)(false);
  const [activeTab, setActiveTab] = (0, import_react18.useState)("output");
  const friendlyMessage = getFriendlyToolMessage(toolCall.tool_name, toolCall.input);
  const executionTime = state?.endTime && state?.startTime ? state.endTime - state.startTime : void 0;
  const renderTabs = () => /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { className: "mt-2", children: [
    /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("div", { className: "mb-2 flex items-center gap-2", children: ["output", "input"].map((tab) => /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(
      "button",
      {
        onClick: () => setActiveTab(tab),
        className: `text-xs px-2 py-1 rounded border transition-colors ${activeTab === tab ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground hover:text-foreground"}`,
        children: tab === "output" ? "Output" : "Input"
      },
      tab
    )) }),
    /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("pre", { className: "text-xs text-muted-foreground whitespace-pre-wrap overflow-auto break-words border border-muted rounded-md p-3", children: activeTab === "input" ? JSON.stringify(toolCall.input, null, 2) : renderResultData(state) }),
    state?.error && activeTab === "output" && /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { className: "mt-2 text-xs text-destructive", children: [
      "Error: ",
      state.error
    ] })
  ] });
  if (state?.status === "pending" || state?.status === "running") {
    return /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("div", { className: "mb-2", children: /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(LoadingShimmer, { text: friendlyMessage }) });
  }
  if (state?.status === "completed") {
    const time = executionTime || 0;
    return /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { className: "mb-2", children: [
      /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { className: "flex items-center justify-between text-sm text-muted-foreground", children: [
        /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(import_lucide_react8.CheckCircle, { className: "w-4 h-4 text-green-600" }),
          /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("span", { children: [
            friendlyMessage,
            " completed",
            time > 100 && /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("span", { className: "ml-1 text-xs", children: [
              "(",
              (time / 1e3).toFixed(1),
              "s)"
            ] })
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)(
          "button",
          {
            onClick: () => setIsExpanded(!isExpanded),
            className: "flex items-center gap-1 text-xs transition-colors hover:text-foreground",
            children: [
              isExpanded ? /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(import_lucide_react8.ChevronDown, { className: "h-3 w-3" }) : /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(import_lucide_react8.ChevronRight, { className: "h-3 w-3" }),
              "View details"
            ]
          }
        )
      ] }),
      isExpanded && renderTabs()
    ] });
  }
  if (state?.status === "error") {
    return /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { className: "mb-3", children: [
      /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { className: "mb-2 flex items-center gap-2 text-sm text-destructive", children: [
        /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(import_lucide_react8.XCircle, { className: "h-4 w-4" }),
        /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("span", { children: [
          friendlyMessage,
          " failed",
          state.error && /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("span", { className: "ml-1 text-xs text-muted-foreground", children: [
            "- ",
            state.error
          ] })
        ] })
      ] }),
      renderTabs()
    ] });
  }
  if (state) {
    return /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("div", { className: "flex items-center gap-2 text-sm text-muted-foreground", children: [
      /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(import_lucide_react8.Clock, { className: "h-4 w-4" }),
      /* @__PURE__ */ (0, import_jsx_runtime17.jsxs)("span", { children: [
        friendlyMessage,
        " (",
        state.status,
        ")"
      ] })
    ] });
  }
  return null;
};
var ToolExecutionRenderer = ({
  event,
  toolCallStates,
  toolRenderers
}) => {
  const toolCalls = event.data?.tool_calls || [];
  if (toolCalls.length === 0) {
    return null;
  }
  const renderResultData = (toolCallState) => {
    if (!toolCallState?.result) {
      return "No result available";
    }
    const resultData = (0, import_core8.extractToolResultData)(toolCallState.result);
    if (resultData) {
      if (typeof resultData.result === "object") {
        return JSON.stringify(resultData.result, null, 2);
      }
      return String(resultData.result);
    }
    return JSON.stringify(toolCallState.result, null, 2);
  };
  return /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(import_jsx_runtime17.Fragment, { children: toolCalls.filter((toolCall) => toolCall.tool_name !== "final").map((toolCall) => {
    const state = toolCallStates.get(toolCall.tool_call_id);
    const renderer = toolRenderers?.[toolCall.tool_name];
    if (renderer) {
      const toolCallPayload = {
        tool_call_id: toolCall.tool_call_id,
        tool_name: toolCall.tool_name,
        input: toolCall.input
      };
      return /* @__PURE__ */ (0, import_jsx_runtime17.jsx)("div", { children: renderer({ toolCall: toolCallPayload, state }) }, toolCall.tool_call_id);
    }
    return /* @__PURE__ */ (0, import_jsx_runtime17.jsx)(
      ToolCallCard,
      {
        toolCall,
        state,
        renderResultData
      },
      toolCall.tool_call_id
    );
  }) });
};

// src/components/renderers/MessageReadTracker.tsx
var import_react20 = require("react");

// src/components/renderers/MessageReadContext.tsx
var import_react19 = require("react");
var import_jsx_runtime18 = require("react/jsx-runtime");
var MessageReadContext = (0, import_react19.createContext)(null);
var MessageReadProvider = ({
  threadId,
  enabled = true,
  children
}) => {
  const { client } = useDistri();
  const [readMessageIds, setReadMessageIds] = (0, import_react19.useState)(/* @__PURE__ */ new Set());
  const [isLoading, setIsLoading] = (0, import_react19.useState)(true);
  const pendingMarks = (0, import_react19.useRef)(/* @__PURE__ */ new Set());
  const fetchedThreadId = (0, import_react19.useRef)(null);
  (0, import_react19.useEffect)(() => {
    if (!enabled || !client || !threadId) {
      setIsLoading(false);
      return;
    }
    if (fetchedThreadId.current === threadId) {
      return;
    }
    const fetchReadStatuses = async () => {
      try {
        setIsLoading(true);
        const statuses = await client.getThreadReadStatus(threadId);
        const ids = new Set(statuses.map((s) => s.message_id));
        setReadMessageIds(ids);
        fetchedThreadId.current = threadId;
      } catch (error) {
        console.error("[MessageReadProvider] Failed to fetch read statuses:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchReadStatuses();
  }, [client, threadId, enabled]);
  (0, import_react19.useEffect)(() => {
    if (fetchedThreadId.current !== threadId) {
      setReadMessageIds(/* @__PURE__ */ new Set());
      pendingMarks.current = /* @__PURE__ */ new Set();
    }
  }, [threadId]);
  const isRead = (0, import_react19.useCallback)((messageId) => {
    return readMessageIds.has(messageId);
  }, [readMessageIds]);
  const markAsRead = (0, import_react19.useCallback)(async (messageId) => {
    if (!client || !threadId || !enabled) {
      return;
    }
    if (readMessageIds.has(messageId) || pendingMarks.current.has(messageId)) {
      return;
    }
    pendingMarks.current.add(messageId);
    try {
      await client.markMessageRead(threadId, messageId);
      setReadMessageIds((prev) => {
        const next = new Set(prev);
        next.add(messageId);
        return next;
      });
    } catch (error) {
      console.error("[MessageReadProvider] Failed to mark message as read:", error);
    } finally {
      pendingMarks.current.delete(messageId);
    }
  }, [client, threadId, enabled, readMessageIds]);
  const value = {
    isRead,
    markAsRead,
    readMessageIds,
    isLoading
  };
  return /* @__PURE__ */ (0, import_jsx_runtime18.jsx)(MessageReadContext.Provider, { value, children });
};
var useMessageReadContext = () => {
  return (0, import_react19.useContext)(MessageReadContext);
};

// src/components/renderers/MessageReadTracker.tsx
var import_jsx_runtime19 = require("react/jsx-runtime");
var MessageReadTracker = ({
  messageId,
  enabled = true,
  threshold = 0.5,
  delay = 500,
  children
}) => {
  const readContext = useMessageReadContext();
  const ref = (0, import_react20.useRef)(null);
  const timeoutRef = (0, import_react20.useRef)(null);
  const hasTriggered = (0, import_react20.useRef)(false);
  (0, import_react20.useEffect)(() => {
    if (!enabled || !readContext || !ref.current || !messageId) {
      return;
    }
    if (readContext.isRead(messageId)) {
      return;
    }
    const element = ref.current;
    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && !hasTriggered.current) {
          if (readContext.isRead(messageId)) {
            return;
          }
          if (!timeoutRef.current) {
            timeoutRef.current = setTimeout(() => {
              hasTriggered.current = true;
              readContext.markAsRead(messageId);
              timeoutRef.current = null;
            }, delay);
          }
        } else if (!entry.isIntersecting) {
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
        }
      },
      {
        threshold,
        root: null
      }
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [enabled, threshold, delay, messageId, readContext]);
  (0, import_react20.useEffect)(() => {
    hasTriggered.current = false;
  }, [messageId]);
  return /* @__PURE__ */ (0, import_jsx_runtime19.jsx)("div", { ref, "data-message-id": messageId, children });
};

// src/components/renderers/MessageRenderer.tsx
var import_jsx_runtime20 = require("react/jsx-runtime");
var RendererWrapper = ({
  children,
  className = "",
  isUserMessage = false
}) => /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("div", { className: `w-full px-4 overflow-hidden ${className}`, style: { maxWidth: "100%", wordBreak: "break-word" }, children: /* @__PURE__ */ (0, import_jsx_runtime20.jsx)(
  "div",
  {
    className: `w-full overflow-hidden ${isUserMessage ? "ml-auto" : "max-w-4xl mx-auto"}`,
    style: { maxWidth: isUserMessage ? "100%" : "min(100%, 56rem)", wordBreak: "break-word" },
    children
  }
) });
function MessageRenderer({
  message,
  index,
  toolRenderers,
  debug = false,
  threadId,
  enableFeedback = false
}) {
  const toolCallsState = useChatStateStore((state) => state.toolCalls);
  if ((0, import_core9.isDistriMessage)(message)) {
    const distriMessage = message;
    const textContent = distriMessage.parts.filter((part) => part.part_type === "text").map((part) => part.data).join("").trim();
    const imageParts = distriMessage.parts.filter((part) => part.part_type === "image");
    if (!textContent && imageParts.length === 0) {
      return null;
    }
  }
  if ((0, import_core9.isDistriMessage)(message)) {
    const distriMessage = message;
    switch (distriMessage.role) {
      case "user":
        return /* @__PURE__ */ (0, import_jsx_runtime20.jsx)(RendererWrapper, { className: "distri-user-message", isUserMessage: true, children: /* @__PURE__ */ (0, import_jsx_runtime20.jsx)(
          UserMessageRenderer,
          {
            message: distriMessage
          }
        ) }, `user-${index}`);
      case "assistant": {
        const shouldTrackRead = enableFeedback && distriMessage.id;
        const content = /* @__PURE__ */ (0, import_jsx_runtime20.jsx)(
          StepBasedRenderer,
          {
            message: distriMessage,
            threadId,
            enableFeedback
          }
        );
        return /* @__PURE__ */ (0, import_jsx_runtime20.jsx)(RendererWrapper, { className: "distri-assistant-message", children: shouldTrackRead ? /* @__PURE__ */ (0, import_jsx_runtime20.jsx)(
          MessageReadTracker,
          {
            messageId: distriMessage.id,
            enabled: true,
            children: content
          }
        ) : content }, `assistant-${index}`);
      }
      case "developer":
        if (!debug) {
          return null;
        }
        return /* @__PURE__ */ (0, import_jsx_runtime20.jsx)(RendererWrapper, { className: "distri-developer-message", children: /* @__PURE__ */ (0, import_jsx_runtime20.jsxs)("div", { className: "p-3 bg-muted/50 border border-dashed border-muted-foreground/30 rounded text-sm", children: [
          /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("div", { className: "text-xs text-muted-foreground font-medium mb-1", children: "Developer Context" }),
          /* @__PURE__ */ (0, import_jsx_runtime20.jsx)(
            UserMessageRenderer,
            {
              message: distriMessage
            }
          )
        ] }) }, `developer-${index}`);
      default:
        return null;
    }
  }
  if ((0, import_core9.isDistriEvent)(message)) {
    const event = message;
    switch (event.type) {
      case "run_started":
        return null;
      case "plan_started":
        return null;
      case "plan_finished":
        return null;
      case "text_message_start":
        return null;
      case "text_message_content":
        return null;
      case "text_message_end":
        return null;
      case "step_started": {
        return null;
      }
      case "step_completed":
        return null;
      case "tool_calls":
        if (toolCallsState.size === 0) {
          return null;
        }
        return /* @__PURE__ */ (0, import_jsx_runtime20.jsx)(RendererWrapper, { className: "distri-tool-execution-start", children: /* @__PURE__ */ (0, import_jsx_runtime20.jsx)(
          ToolExecutionRenderer,
          {
            event,
            toolCallStates: toolCallsState,
            toolRenderers
          }
        ) }, `tool-execution-start-${index}`);
      case "tool_results":
        return null;
      case "agent_handover":
        return /* @__PURE__ */ (0, import_jsx_runtime20.jsx)(RendererWrapper, { className: "distri-handover", children: /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("div", { className: "p-3 bg-muted rounded border", children: /* @__PURE__ */ (0, import_jsx_runtime20.jsxs)("div", { className: "text-sm text-muted-foreground", children: [
          /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("strong", { children: "Handover to:" }),
          " ",
          event.data?.to_agent || "unknown agent"
        ] }) }) }, `handover-${index}`);
      case "run_finished":
        return null;
      case "run_error":
        return /* @__PURE__ */ (0, import_jsx_runtime20.jsx)(RendererWrapper, { className: "distri-run-error", children: /* @__PURE__ */ (0, import_jsx_runtime20.jsxs)("div", { className: "p-3 bg-destructive/10 border border-destructive/20 rounded", children: [
          /* @__PURE__ */ (0, import_jsx_runtime20.jsxs)("div", { className: "text-sm text-destructive", children: [
            /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("strong", { children: "Error:" }),
            " ",
            event.data?.message || "Unknown error occurred"
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime20.jsx)("button", { className: "mt-2 text-xs text-destructive underline", children: "Retry" })
        ] }) }, `run-error-${index}`);
      default:
        return null;
    }
  }
  return null;
}

// src/components/renderers/TodosDisplay.tsx
var import_react21 = require("react");
var import_lucide_react9 = require("lucide-react");
var import_jsx_runtime21 = require("react/jsx-runtime");
var getStatusIcon = (status) => {
  switch (status) {
    case "done":
      return /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(import_lucide_react9.CheckCircle2, { className: "h-4 w-4 text-green-500 flex-shrink-0" });
    case "in_progress":
      return /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(import_lucide_react9.Loader2, { className: "h-4 w-4 text-blue-500 animate-spin flex-shrink-0" });
    case "open":
    default:
      return /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(import_lucide_react9.Circle, { className: "h-4 w-4 text-muted-foreground flex-shrink-0" });
  }
};
var getStatusStyles = (status) => {
  switch (status) {
    case "done":
      return "text-muted-foreground line-through";
    case "in_progress":
      return "text-foreground font-medium";
    case "open":
    default:
      return "text-foreground";
  }
};
var TodosDisplay = ({
  todos,
  className = "",
  title = "Tasks",
  autoCollapseOnDone = true,
  defaultCollapsed = false
}) => {
  const [isCollapsed, setIsCollapsed] = (0, import_react21.useState)(defaultCollapsed);
  if (!todos || todos.length === 0) {
    return null;
  }
  const completedCount = todos.filter((t) => t.status === "done").length;
  const inProgressCount = todos.filter((t) => t.status === "in_progress").length;
  const totalCount = todos.length;
  const allDone = completedCount === totalCount;
  (0, import_react21.useEffect)(() => {
    if (autoCollapseOnDone && allDone) {
      setIsCollapsed(true);
    }
  }, [autoCollapseOnDone, allDone]);
  return /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("div", { className: `rounded-lg border bg-card p-3 ${className}`, children: [
    /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)(
      "button",
      {
        onClick: () => setIsCollapsed(!isCollapsed),
        className: "flex items-center justify-between w-full text-left hover:opacity-80 transition-opacity",
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("div", { className: "flex items-center gap-1.5", children: [
            isCollapsed ? /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(import_lucide_react9.ChevronRight, { className: "h-4 w-4 text-muted-foreground" }) : /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(import_lucide_react9.ChevronDown, { className: "h-4 w-4 text-muted-foreground" }),
            /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("h4", { className: "text-sm font-medium text-foreground", children: title }),
            allDone && /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(import_lucide_react9.CheckCircle2, { className: "h-4 w-4 text-green-500 ml-1" })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)("span", { className: "text-xs text-muted-foreground", children: [
            completedCount,
            "/",
            totalCount,
            " done",
            inProgressCount > 0 && ` (${inProgressCount} in progress)`
          ] })
        ]
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("div", { className: "h-1.5 bg-muted rounded-full mt-2 overflow-hidden", children: /* @__PURE__ */ (0, import_jsx_runtime21.jsx)(
      "div",
      {
        className: "h-full bg-green-500 transition-all duration-300",
        style: { width: `${completedCount / totalCount * 100}%` }
      }
    ) }),
    !isCollapsed && /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("ul", { className: "space-y-1.5 overflow-hidden mt-3", children: todos.map((todo) => /* @__PURE__ */ (0, import_jsx_runtime21.jsxs)(
      "li",
      {
        className: "flex items-start gap-2 text-sm min-w-0",
        children: [
          getStatusIcon(todo.status),
          /* @__PURE__ */ (0, import_jsx_runtime21.jsx)("span", { className: `${getStatusStyles(todo.status)} break-words min-w-0`, children: todo.content })
        ]
      },
      todo.id
    )) })
  ] });
};

// src/components/renderers/TypingIndicator.tsx
var import_jsx_runtime22 = require("react/jsx-runtime");
var TypingIndicator = () => {
  return /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("div", { className: "flex items-center gap-4 py-3", children: /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("div", { className: "w-full", children: /* @__PURE__ */ (0, import_jsx_runtime22.jsx)("div", { className: "flex items-center space-x-1 p-3 bg-muted/30 rounded-lg w-fit", children: /* @__PURE__ */ (0, import_jsx_runtime22.jsxs)("div", { className: "flex space-x-1", children: [
    /* @__PURE__ */ (0, import_jsx_runtime22.jsx)(
      "div",
      {
        className: "h-2 w-2 bg-muted-foreground rounded-full animate-bounce",
        style: { animationDelay: "0ms" }
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime22.jsx)(
      "div",
      {
        className: "h-2 w-2 bg-muted-foreground rounded-full animate-bounce",
        style: { animationDelay: "150ms" }
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime22.jsx)(
      "div",
      {
        className: "h-2 w-2 bg-muted-foreground rounded-full animate-bounce",
        style: { animationDelay: "300ms" }
      }
    )
  ] }) }) }) });
};

// src/components/renderers/LoadingAnimation.tsx
var import_jsx_runtime23 = require("react/jsx-runtime");
var sizeClasses = {
  sm: { dot: "h-1.5 w-1.5", container: "p-2", avatar: "w-8 h-8 text-base" },
  md: { dot: "h-2 w-2", container: "p-3", avatar: "w-10 h-10 text-lg" },
  lg: { dot: "h-3 w-3", container: "p-4", avatar: "w-12 h-12 text-xl" }
};
var TypingDotsAnimation = ({ config }) => {
  const size = config.size || "md";
  const classes = sizeClasses[size];
  const dotColor = config.primaryColor || "currentColor";
  return /* @__PURE__ */ (0, import_jsx_runtime23.jsx)("div", { className: `flex items-center gap-4 py-3 ${config.className || ""}`, children: /* @__PURE__ */ (0, import_jsx_runtime23.jsx)("div", { className: "w-full", children: /* @__PURE__ */ (0, import_jsx_runtime23.jsxs)("div", { className: `flex items-center space-x-1 ${classes.container} bg-muted/30 rounded-lg w-fit`, children: [
    /* @__PURE__ */ (0, import_jsx_runtime23.jsx)("div", { className: "flex space-x-1", children: [0, 150, 300].map((delay, i) => /* @__PURE__ */ (0, import_jsx_runtime23.jsx)(
      "div",
      {
        className: `${classes.dot} rounded-full animate-bounce`,
        style: {
          animationDelay: `${delay}ms`,
          backgroundColor: dotColor === "currentColor" ? void 0 : dotColor
        }
      },
      i
    )) }),
    config.label && /* @__PURE__ */ (0, import_jsx_runtime23.jsx)("span", { className: "ml-2 text-sm text-muted-foreground", children: config.label })
  ] }) }) });
};
var PulseRingAnimation = ({ config }) => {
  const size = config.size || "md";
  const sizeMap = { sm: "w-8 h-8", md: "w-12 h-12", lg: "w-16 h-16" };
  const primaryColor = config.primaryColor || "#10B981";
  const secondaryColor = config.secondaryColor || "#34D399";
  return /* @__PURE__ */ (0, import_jsx_runtime23.jsxs)("div", { className: `flex items-center gap-3 py-3 ${config.className || ""}`, children: [
    /* @__PURE__ */ (0, import_jsx_runtime23.jsxs)("div", { className: `${sizeMap[size]} relative flex items-center justify-center`, children: [
      /* @__PURE__ */ (0, import_jsx_runtime23.jsx)(
        "div",
        {
          className: "absolute inset-1 rounded-full animate-pulse",
          style: { background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})` }
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime23.jsx)(
        "div",
        {
          className: "absolute inset-0 rounded-full animate-ping opacity-75",
          style: { border: `2px solid ${primaryColor}` }
        }
      )
    ] }),
    config.label && /* @__PURE__ */ (0, import_jsx_runtime23.jsx)("span", { className: "text-sm text-muted-foreground", children: config.label })
  ] });
};
var TeacherTypingAnimation = ({ config }) => {
  const size = config.size || "md";
  const classes = sizeClasses[size];
  const primaryColor = config.primaryColor || "#10B981";
  const secondaryColor = config.secondaryColor || "#34D399";
  const avatar = config.avatar || "\u{1F393}";
  return /* @__PURE__ */ (0, import_jsx_runtime23.jsxs)("div", { className: `flex items-start gap-3 py-3 ${config.className || ""}`, children: [
    /* @__PURE__ */ (0, import_jsx_runtime23.jsx)(
      "div",
      {
        className: `${classes.avatar} rounded-full flex items-center justify-center shrink-0`,
        style: { background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})` },
        children: avatar
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime23.jsxs)("div", { className: "flex flex-col gap-1", children: [
      config.label && /* @__PURE__ */ (0, import_jsx_runtime23.jsx)("span", { className: "text-xs font-medium text-muted-foreground", children: config.label }),
      /* @__PURE__ */ (0, import_jsx_runtime23.jsx)("div", { className: `flex items-center space-x-1 ${classes.container} bg-muted/50 rounded-2xl w-fit`, children: /* @__PURE__ */ (0, import_jsx_runtime23.jsx)("div", { className: "flex space-x-1", children: [0, 200, 400].map((delay, i) => /* @__PURE__ */ (0, import_jsx_runtime23.jsx)(
        "div",
        {
          className: `${classes.dot} bg-muted-foreground/50 rounded-full`,
          style: {
            animation: "typingBounce 1.4s infinite ease-in-out",
            animationDelay: `${delay}ms`
          }
        },
        i
      )) }) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime23.jsx)("style", { children: `
        @keyframes typingBounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-6px); }
        }
      ` })
  ] });
};
var SpinnerAnimation = ({ config }) => {
  const size = config.size || "md";
  const sizeMap = { sm: "w-5 h-5", md: "w-8 h-8", lg: "w-10 h-10" };
  const primaryColor = config.primaryColor || "currentColor";
  return /* @__PURE__ */ (0, import_jsx_runtime23.jsxs)("div", { className: `flex items-center gap-3 py-3 ${config.className || ""}`, children: [
    /* @__PURE__ */ (0, import_jsx_runtime23.jsx)(
      "div",
      {
        className: `${sizeMap[size]} animate-spin rounded-full border-2 border-muted border-t-current`,
        style: primaryColor !== "currentColor" ? { borderTopColor: primaryColor } : void 0
      }
    ),
    config.label && /* @__PURE__ */ (0, import_jsx_runtime23.jsx)("span", { className: "text-sm text-muted-foreground", children: config.label })
  ] });
};
var WaveAnimation = ({ config }) => {
  const size = config.size || "md";
  const barHeights = { sm: "h-4", md: "h-6", lg: "h-8" };
  const barWidths = { sm: "w-1", md: "w-1.5", lg: "w-2" };
  const primaryColor = config.primaryColor || "#6366F1";
  return /* @__PURE__ */ (0, import_jsx_runtime23.jsxs)("div", { className: `flex items-center gap-3 py-3 ${config.className || ""}`, children: [
    /* @__PURE__ */ (0, import_jsx_runtime23.jsx)("div", { className: "flex items-end gap-1", children: [0, 100, 200, 300, 400].map((delay, i) => /* @__PURE__ */ (0, import_jsx_runtime23.jsx)(
      "div",
      {
        className: `${barWidths[size]} ${barHeights[size]} rounded-full`,
        style: {
          backgroundColor: primaryColor,
          animation: "wave 1.2s ease-in-out infinite",
          animationDelay: `${delay}ms`
        }
      },
      i
    )) }),
    config.label && /* @__PURE__ */ (0, import_jsx_runtime23.jsx)("span", { className: "text-sm text-muted-foreground", children: config.label }),
    /* @__PURE__ */ (0, import_jsx_runtime23.jsx)("style", { children: `
        @keyframes wave {
          0%, 100% { transform: scaleY(0.5); opacity: 0.5; }
          50% { transform: scaleY(1); opacity: 1; }
        }
      ` })
  ] });
};
var LoadingAnimation = ({ config = {} }) => {
  const preset = config.preset || "typing-dots";
  switch (preset) {
    case "typing-dots":
      return /* @__PURE__ */ (0, import_jsx_runtime23.jsx)(TypingDotsAnimation, { config });
    case "pulse-ring":
      return /* @__PURE__ */ (0, import_jsx_runtime23.jsx)(PulseRingAnimation, { config });
    case "teacher-typing":
      return /* @__PURE__ */ (0, import_jsx_runtime23.jsx)(TeacherTypingAnimation, { config });
    case "spinner":
      return /* @__PURE__ */ (0, import_jsx_runtime23.jsx)(SpinnerAnimation, { config });
    case "wave":
      return /* @__PURE__ */ (0, import_jsx_runtime23.jsx)(WaveAnimation, { config });
    default:
      return /* @__PURE__ */ (0, import_jsx_runtime23.jsx)(TypingDotsAnimation, { config });
  }
};

// src/components/ui/select.tsx
var React16 = __toESM(require("react"), 1);
var SelectPrimitive = __toESM(require("@radix-ui/react-select"), 1);
var import_lucide_react10 = require("lucide-react");
var import_jsx_runtime24 = require("react/jsx-runtime");
var Select = SelectPrimitive.Root;
var SelectGroup = SelectPrimitive.Group;
var SelectValue = SelectPrimitive.Value;
var SelectTrigger = React16.forwardRef(({ className, children, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)(
  SelectPrimitive.Trigger,
  {
    ref,
    className: cn(
      "flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background data-[placeholder]:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1",
      className
    ),
    ...props,
    children: [
      children,
      /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(SelectPrimitive.Icon, { asChild: true, children: /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(import_lucide_react10.ChevronDown, { className: "h-4 w-4 opacity-50" }) })
    ]
  }
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;
var SelectScrollUpButton = React16.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(
  SelectPrimitive.ScrollUpButton,
  {
    ref,
    className: cn(
      "flex cursor-default items-center justify-center py-1",
      className
    ),
    ...props,
    children: /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(import_lucide_react10.ChevronUp, { className: "h-4 w-4" })
  }
));
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;
var SelectScrollDownButton = React16.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(
  SelectPrimitive.ScrollDownButton,
  {
    ref,
    className: cn(
      "flex cursor-default items-center justify-center py-1",
      className
    ),
    ...props,
    children: /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(import_lucide_react10.ChevronDown, { className: "h-4 w-4" })
  }
));
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName;
var SelectContent = React16.forwardRef(({ className, children, position = "popper", ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(SelectPrimitive.Portal, { children: /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)(
  SelectPrimitive.Content,
  {
    ref,
    className: cn(
      "relative z-50 max-h-[--radix-select-content-available-height] min-w-[8rem] overflow-y-auto overflow-x-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[--radix-select-content-transform-origin]",
      position === "popper" && "data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",
      className
    ),
    position,
    ...props,
    children: [
      /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(SelectScrollUpButton, {}),
      /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(
        SelectPrimitive.Viewport,
        {
          className: cn(
            "p-1",
            position === "popper" && "h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]"
          ),
          children
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(SelectScrollDownButton, {})
    ]
  }
) }));
SelectContent.displayName = SelectPrimitive.Content.displayName;
var SelectLabel = React16.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(
  SelectPrimitive.Label,
  {
    ref,
    className: cn("px-2 py-1.5 text-sm font-semibold", className),
    ...props
  }
));
SelectLabel.displayName = SelectPrimitive.Label.displayName;
var SelectItem = React16.forwardRef(({ className, children, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime24.jsxs)(
  SelectPrimitive.Item,
  {
    ref,
    className: cn(
      "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    ),
    ...props,
    children: [
      /* @__PURE__ */ (0, import_jsx_runtime24.jsx)("span", { className: "absolute right-2 flex h-3.5 w-3.5 items-center justify-center", children: /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(SelectPrimitive.ItemIndicator, { children: /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(import_lucide_react10.Check, { className: "h-4 w-4" }) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(SelectPrimitive.ItemText, { children })
    ]
  }
));
SelectItem.displayName = SelectPrimitive.Item.displayName;
var SelectSeparator = React16.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime24.jsx)(
  SelectPrimitive.Separator,
  {
    ref,
    className: cn("-mx-1 my-1 h-px bg-muted", className),
    ...props
  }
));
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

// src/hooks/useTts.ts
var import_react22 = require("react");
var useTts = (config = {}) => {
  const baseUrl = config.baseUrl || "http://localhost:8080/v1";
  const [isSynthesizing, setIsSynthesizing] = (0, import_react22.useState)(false);
  const wsRef = (0, import_react22.useRef)(null);
  const audioContextRef = (0, import_react22.useRef)(null);
  const synthesize = (0, import_react22.useCallback)(async (request) => {
    const authHeader = config.accessToken ? `Bearer ${config.accessToken}` : void 0;
    const response = await fetch(`${baseUrl}/tts/synthesize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeader && { Authorization: authHeader }
      },
      body: JSON.stringify(request)
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `TTS request failed: ${response.status}`);
    }
    return response.blob();
  }, [baseUrl, config.accessToken]);
  const getAvailableVoices = (0, import_react22.useCallback)(async () => {
    const authHeader = config.accessToken ? `Bearer ${config.accessToken}` : void 0;
    const response = await fetch(`${baseUrl}/tts/voices`, {
      headers: {
        ...authHeader && { Authorization: authHeader }
      }
    });
    if (!response.ok) {
      throw new Error(`Failed to get voices: ${response.status}`);
    }
    return response.json();
  }, [baseUrl, config.accessToken]);
  const playAudio = (0, import_react22.useCallback)((audioBlob) => {
    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);
    return new Promise((resolve, reject) => {
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        resolve();
      };
      audio.onerror = () => {
        URL.revokeObjectURL(audioUrl);
        reject(new Error("Audio playback failed"));
      };
      audio.play().catch(reject);
    });
  }, []);
  const streamingPlayAudio = (0, import_react22.useCallback)((audioChunks) => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    const audioContext = audioContextRef.current;
    return new Promise((resolve, reject) => {
      (async () => {
        try {
          const totalLength = audioChunks.reduce((sum, chunk) => sum + chunk.length, 0);
          const combinedArray = new Uint8Array(totalLength);
          let offset = 0;
          for (const chunk of audioChunks) {
            combinedArray.set(chunk, offset);
            offset += chunk.length;
          }
          const audioBuffer = await audioContext.decodeAudioData(combinedArray.buffer);
          const source = audioContext.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(audioContext.destination);
          source.onended = () => resolve();
          source.start();
        } catch (error) {
          reject(new Error(`Audio playback failed: ${error}`));
        }
      })();
    });
  }, []);
  const startStreamingTts = (0, import_react22.useCallback)((options = {}) => {
    if (isSynthesizing) {
      throw new Error("Streaming TTS already in progress");
    }
    const wsUrl = baseUrl.replace("http://", "ws://").replace("https://", "wss://") + "/voice/stream";
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    setIsSynthesizing(true);
    ws.onopen = () => {
      const configMessage = {
        type: "start_session"
      };
      ws.send(JSON.stringify(configMessage));
      if (options.voice || options.speed) {
        const configUpdate = {
          type: "config",
          voice: options.voice
        };
        ws.send(JSON.stringify(configUpdate));
      }
      options.onStart?.();
    };
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        switch (data.type) {
          case "audio_chunk":
            if (data.data) {
              const audioData = new Uint8Array(data.data);
              options.onAudioChunk?.(audioData);
            }
            break;
          case "text_chunk":
            options.onTextChunk?.(data.text || "", data.is_final || false);
            break;
          case "session_started":
            break;
          case "session_ended":
            break;
          case "error":
            options.onError?.(new Error(data.message || "WebSocket error"));
            break;
        }
      } catch (error) {
        options.onError?.(new Error("Failed to parse WebSocket message"));
      }
    };
    ws.onerror = () => {
      options.onError?.(new Error("WebSocket connection error"));
    };
    ws.onclose = () => {
      setIsSynthesizing(false);
      options.onEnd?.();
    };
    return {
      sendText: (text) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "text_chunk", text }));
        }
      },
      stop: () => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "end_session" }));
        }
        ws.close();
      }
    };
  }, [isSynthesizing, baseUrl]);
  const stopStreamingTts = (0, import_react22.useCallback)(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
      setIsSynthesizing(false);
    }
  }, []);
  return {
    synthesize,
    getAvailableVoices,
    playAudio,
    streamingPlayAudio,
    startStreamingTts,
    stopStreamingTts,
    isSynthesizing
  };
};

// src/components/ChatEmptyState.tsx
var import_jsx_runtime25 = require("react/jsx-runtime");
var DefaultChatEmptyState = ({ controller, options, maxWidth }) => {
  const disabled = controller.isLoading || controller.isStreaming;
  const categories = options?.categories ?? [];
  const defaultLayout = options?.layout ?? "list";
  const handleStarterClick = (starter) => {
    const prompt = starter.prompt ?? starter.label;
    console.log("[ChatEmptyState] Starter clicked:", { label: starter.label, prompt, autoSend: starter.autoSend });
    controller.setInput(prompt);
    const shouldSubmit = starter.autoSend ?? options?.autoSendOnStarterClick ?? true;
    console.log("[ChatEmptyState] Should submit:", shouldSubmit);
    if (!shouldSubmit) {
      return;
    }
    console.log("[ChatEmptyState] Submitting prompt:", prompt);
    void controller.submit(prompt).catch((err) => {
      console.error("[ChatEmptyState] Submit error:", err);
    });
  };
  const renderStarter = (starter, layout) => {
    const variant = starter.variant ?? "outline";
    const isGrid = layout === "grid";
    return /* @__PURE__ */ (0, import_jsx_runtime25.jsxs)(
      Button,
      {
        type: "button",
        variant,
        size: "sm",
        className: `h-auto whitespace-normal rounded-lg border-border/50 bg-background text-left text-sm font-normal hover:border-primary/40 hover:bg-primary/5 transition-all cursor-pointer select-none ${isGrid ? "flex-col items-center justify-center p-4 gap-2" : "justify-start px-3 py-3"}`,
        onClick: (e) => {
          e.preventDefault();
          e.stopPropagation();
          handleStarterClick(starter);
        },
        disabled,
        children: [
          starter.icon && /* @__PURE__ */ (0, import_jsx_runtime25.jsx)("span", { className: `text-lg ${isGrid ? "" : "mr-2"}`, children: starter.icon }),
          /* @__PURE__ */ (0, import_jsx_runtime25.jsxs)("span", { className: `flex flex-col ${isGrid ? "items-center text-center" : "items-start"} gap-1`, children: [
            /* @__PURE__ */ (0, import_jsx_runtime25.jsx)("span", { className: "font-medium text-foreground", children: starter.label }),
            starter.description ? /* @__PURE__ */ (0, import_jsx_runtime25.jsx)("span", { className: "text-xs text-muted-foreground", children: starter.description }) : null
          ] })
        ]
      },
      starter.id ?? starter.label
    );
  };
  return /* @__PURE__ */ (0, import_jsx_runtime25.jsx)("div", { className: "py-4 sm:py-8", children: /* @__PURE__ */ (0, import_jsx_runtime25.jsx)(
    "div",
    {
      className: "mx-auto w-full px-2",
      style: maxWidth ? { maxWidth } : void 0,
      children: /* @__PURE__ */ (0, import_jsx_runtime25.jsx)("div", { className: "", children: /* @__PURE__ */ (0, import_jsx_runtime25.jsxs)("div", { className: "flex flex-col gap-6", children: [
        controller.composer ? /* @__PURE__ */ (0, import_jsx_runtime25.jsxs)("div", { className: "flex flex-col gap-2", children: [
          controller.composer,
          options?.promptHelperText ? /* @__PURE__ */ (0, import_jsx_runtime25.jsx)("p", { className: "text-xs text-muted-foreground text-center sm:text-left", children: options.promptHelperText }) : null
        ] }) : null,
        categories.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime25.jsxs)("div", { className: "space-y-1 p-1", children: [
          options?.categoriesLabel ? /* @__PURE__ */ (0, import_jsx_runtime25.jsx)("p", { className: "text-xs font-medium uppercase tracking-wide text-muted-foreground", children: options.categoriesLabel }) : null,
          options?.startersLabel ? /* @__PURE__ */ (0, import_jsx_runtime25.jsx)("p", { className: "text-sm font-medium text-muted-foreground", children: options.startersLabel }) : null,
          /* @__PURE__ */ (0, import_jsx_runtime25.jsx)("div", { className: "flex flex-col gap-3", children: categories.map((category) => {
            const categoryLayout = category.layout ?? defaultLayout;
            return /* @__PURE__ */ (0, import_jsx_runtime25.jsxs)(
              "div",
              {
                className: "bg-background/70 p-1 sm:p-4",
                children: [
                  category.title || category.description || category.icon ? /* @__PURE__ */ (0, import_jsx_runtime25.jsxs)("div", { className: "flex items-start gap-2 mb-3", children: [
                    category.icon && /* @__PURE__ */ (0, import_jsx_runtime25.jsx)("span", { className: "text-xl", children: category.icon }),
                    /* @__PURE__ */ (0, import_jsx_runtime25.jsxs)("div", { className: "flex flex-col gap-1", children: [
                      category.title ? /* @__PURE__ */ (0, import_jsx_runtime25.jsx)("h3", { className: "text-xs font-semibold text-foreground", children: category.title }) : null,
                      category.description ? /* @__PURE__ */ (0, import_jsx_runtime25.jsx)("p", { className: "text-xs text-muted-foreground", children: category.description }) : null
                    ] })
                  ] }) : null,
                  category.starters && category.starters.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime25.jsx)("div", { className: categoryLayout === "grid" ? "grid grid-cols-2 sm:grid-cols-3 gap-2" : "flex flex-col gap-2", children: category.starters.map((starter) => renderStarter(starter, categoryLayout)) }) : null
                ]
              },
              category.id
            );
          }) })
        ] }) : null
      ] }) })
    }
  ) });
};

// src/hooks/useChatMessages.ts
var import_react23 = require("react");

// ../core/src/encoder.ts
function convertA2AMessageToDistri(a2aMessage) {
  const role = a2aMessage.role === "agent" ? "assistant" : "user";
  let agent_id;
  let agent_name;
  if (a2aMessage.metadata) {
    const metadata = a2aMessage.metadata;
    if (metadata.agent) {
      agent_id = metadata.agent.agent_id;
      agent_name = metadata.agent.agent_name;
    }
  }
  return {
    id: a2aMessage.messageId,
    role,
    parts: a2aMessage.parts.map(convertA2APartToDistri),
    created_at: a2aMessage.createdAt,
    agent_id,
    agent_name
  };
}
function convertA2AStatusUpdateToDistri(statusUpdate) {
  if (!statusUpdate.metadata || !statusUpdate.metadata.type) {
    return null;
  }
  const metadata = statusUpdate.metadata;
  switch (metadata.type) {
    case "run_started": {
      const runStartedResult = {
        type: "run_started",
        data: {
          runId: statusUpdate.runId,
          taskId: statusUpdate.taskId
        }
      };
      return runStartedResult;
    }
    case "run_error": {
      const runErrorResult = {
        type: "run_error",
        data: {
          message: metadata.message || statusUpdate.status?.message || "Unknown error",
          code: metadata.code
        }
      };
      return runErrorResult;
    }
    case "run_finished": {
      const runFinishedResult = {
        type: "run_finished",
        data: {
          runId: statusUpdate.runId,
          taskId: statusUpdate.taskId
        }
      };
      return runFinishedResult;
    }
    case "plan_started": {
      const planStartedResult = {
        type: "plan_started",
        data: {
          initial_plan: metadata.initial_plan
        }
      };
      return planStartedResult;
    }
    case "plan_finished": {
      const planFinishedResult = {
        type: "plan_finished",
        data: {
          total_steps: metadata.total_steps
        }
      };
      return planFinishedResult;
    }
    case "step_started": {
      const stepStartedResult = {
        type: "step_started",
        data: {
          step_id: metadata.step_id,
          step_title: metadata.step_title || "Processing",
          step_index: metadata.step_index || 0
        }
      };
      return stepStartedResult;
    }
    case "step_completed": {
      const stepCompletedResult = {
        type: "step_completed",
        data: {
          step_id: metadata.step_id,
          step_title: metadata.step_title || "Processing",
          step_index: metadata.step_index || 0
        }
      };
      return stepCompletedResult;
    }
    case "tool_execution_start": {
      const toolStartResult = {
        type: "tool_execution_start",
        data: {
          tool_call_id: metadata.tool_call_id,
          tool_call_name: metadata.tool_call_name || "Tool",
          parent_message_id: statusUpdate.taskId
        }
      };
      return toolStartResult;
    }
    case "tool_execution_end": {
      const toolEndResult = {
        type: "tool_execution_end",
        data: {
          tool_call_id: metadata.tool_call_id
        }
      };
      return toolEndResult;
    }
    case "text_message_start": {
      const textStartResult = {
        type: "text_message_start",
        data: {
          message_id: metadata.message_id,
          step_id: metadata.step_id || "",
          role: metadata.role === "assistant" ? "assistant" : "user"
        }
      };
      return textStartResult;
    }
    case "text_message_content": {
      const textContentResult = {
        type: "text_message_content",
        data: {
          message_id: metadata.message_id,
          step_id: metadata.step_id || "",
          delta: metadata.delta || ""
        }
      };
      return textContentResult;
    }
    case "text_message_end": {
      const textEndResult = {
        type: "text_message_end",
        data: {
          message_id: metadata.message_id,
          step_id: metadata.step_id || ""
        }
      };
      return textEndResult;
    }
    case "tool_calls": {
      const toolCallsResult = {
        type: "tool_calls",
        data: {
          tool_calls: metadata.tool_calls || []
        }
      };
      return toolCallsResult;
    }
    case "tool_results": {
      const toolResultsResult = {
        type: "tool_results",
        data: {
          results: metadata.results || []
        }
      };
      return toolResultsResult;
    }
    case "browser_screenshot": {
      const browserScreenshotResult = {
        type: "browser_screenshot",
        data: {
          image: metadata.image || "",
          format: metadata.format,
          filename: metadata.filename,
          size: metadata.size,
          timestamp_ms: metadata.timestamp_ms
        }
      };
      return browserScreenshotResult;
    }
    case "inline_hook_requested": {
      const hookRequested = {
        type: "inline_hook_requested",
        data: {
          hook_id: metadata.request?.hook_id || metadata.hook_id || "",
          hook: metadata.request?.hook || metadata.hook || "",
          context: metadata.request?.context || metadata.context || {
            agent_id: statusUpdate.agentId,
            thread_id: statusUpdate.contextId,
            task_id: statusUpdate.taskId,
            run_id: statusUpdate.agentId
          },
          timeout_ms: metadata.request?.timeout_ms || metadata.timeout_ms,
          fire_and_forget: metadata.request?.fire_and_forget ?? metadata.fire_and_forget,
          message: metadata.request?.message || metadata.message,
          plan: metadata.request?.plan || metadata.plan,
          result: metadata.request?.result || metadata.result
        }
      };
      return hookRequested;
    }
    case "browser_session_started": {
      const browserSessionStarted = {
        type: "browser_session_started",
        data: {
          session_id: metadata.session_id || "",
          viewer_url: metadata.viewer_url,
          stream_url: metadata.stream_url
        }
      };
      return browserSessionStarted;
    }
    case "todos_updated": {
      const todos = parseTodosFromFormatted(metadata.formatted_todos || "");
      const todosUpdated = {
        type: "todos_updated",
        data: {
          formatted_todos: metadata.formatted_todos || "",
          action: metadata.action || "write_todos",
          todo_count: metadata.todo_count || 0,
          todos
        }
      };
      return todosUpdated;
    }
    default: {
      console.warn(`Unhandled status update metadata type: ${metadata.type}`, metadata);
      const defaultResult = {
        type: "run_started",
        data: {
          runId: statusUpdate.runId,
          taskId: statusUpdate.taskId
        }
      };
      return defaultResult;
    }
  }
}
function decodeA2AStreamEvent(event) {
  if (event.kind === "message") {
    return convertA2AMessageToDistri(event);
  }
  if (event.kind === "status-update") {
    return convertA2AStatusUpdateToDistri(event);
  }
  return null;
}
function convertA2APartToDistri(a2aPart) {
  switch (a2aPart.kind) {
    case "text":
      return { part_type: "text", data: a2aPart.text };
    case "file":
      if ("uri" in a2aPart.file) {
        const fileUrl = { type: "url", mime_type: a2aPart.file.mimeType || "application/octet-stream", url: a2aPart.file.uri || "" };
        return { part_type: "image", data: fileUrl };
      } else {
        const fileBytes = { type: "bytes", mime_type: a2aPart.file.mimeType || "application/octet-stream", data: a2aPart.file.bytes || "" };
        return { part_type: "image", data: fileBytes };
      }
    case "data":
      switch (a2aPart.data.part_type) {
        case "tool_call":
          return { part_type: "tool_call", data: a2aPart.data };
        case "tool_result":
          return { part_type: "tool_result", data: a2aPart.data };
        default:
          return { part_type: "data", data: a2aPart.data };
      }
    default:
      return { part_type: "text", data: JSON.stringify(a2aPart) };
  }
}
function parseTodosFromFormatted(formatted) {
  if (!formatted || formatted === "\u25A1 No todos") {
    return [];
  }
  const lines = formatted.split("\n").filter((line) => line.trim());
  return lines.map((line, index) => {
    const trimmed = line.trim();
    let status = "open";
    let content = trimmed;
    if (trimmed.startsWith("\u25A0")) {
      status = "done";
      content = trimmed.slice(1).trim();
    } else if (trimmed.startsWith("\u25D0")) {
      status = "in_progress";
      content = trimmed.slice(1).trim();
    } else if (trimmed.startsWith("\u25A1")) {
      status = "open";
      content = trimmed.slice(1).trim();
    }
    return {
      id: `todo_${index}`,
      content,
      status
    };
  });
}

// src/hooks/useChatMessages.ts
function useChatMessages({
  initialMessages = [],
  threadId,
  onError,
  enabled = true
} = {}) {
  const onErrorRef = (0, import_react23.useRef)(onError);
  const { client } = useDistri();
  (0, import_react23.useEffect)(() => {
    onErrorRef.current = onError;
  }, [onError]);
  const [messages, setMessages] = (0, import_react23.useState)(initialMessages);
  const [isLoading, setIsLoading] = (0, import_react23.useState)(false);
  const [error, setError] = (0, import_react23.useState)(null);
  const initialMessagesLength = initialMessages.length;
  (0, import_react23.useEffect)(() => {
    if (initialMessages.length > 0) {
      setMessages(initialMessages);
    }
  }, [initialMessages]);
  const addMessage = (0, import_react23.useCallback)((message) => {
    setMessages((prev) => {
      return [...prev, message];
    });
  }, []);
  const clearMessages = (0, import_react23.useCallback)(() => {
    setMessages([]);
  }, []);
  const fetchMessages = (0, import_react23.useCallback)(async () => {
    if (!client || !threadId) return;
    try {
      setIsLoading(true);
      setError(null);
      const a2aMessages = await client.getThreadMessages(threadId);
      const distriMessages = a2aMessages.map(decodeA2AStreamEvent).filter(Boolean);
      setMessages(distriMessages);
    } catch (err) {
      const error2 = err instanceof Error ? err : new Error("Failed to fetch messages");
      setError(error2);
      onErrorRef.current?.(error2);
    } finally {
      setIsLoading(false);
    }
  }, [client, threadId]);
  (0, import_react23.useEffect)(() => {
    if (threadId && client && !initialMessagesLength && enabled) {
      fetchMessages();
    }
  }, [client, fetchMessages, initialMessagesLength, threadId, enabled]);
  return {
    messages,
    addMessage,
    clearMessages,
    fetchMessages,
    isLoading,
    error
  };
}

// src/components/AuthLoading.tsx
var import_react24 = require("react");
var import_lucide_react11 = require("lucide-react");
var import_jsx_runtime26 = require("react/jsx-runtime");
var AuthLoading = ({
  children,
  className = ""
}) => {
  const {
    status,
    error,
    requestAuth,
    setToken,
    setStatus,
    setError,
    resolveAuth,
    // Use explicit resolver
    config
  } = useDistriAuth();
  const iframeRef = (0, import_react24.useRef)(null);
  const timeoutRef = (0, import_react24.useRef)(null);
  (0, import_react24.useEffect)(() => {
    if (status !== "loading") return;
    if (config.debug) console.log("[AuthWorker] Starting authentication phase");
    iframeRef.current?.contentWindow?.postMessage({ type: "distri:refresh_token" }, "*");
    timeoutRef.current = setTimeout(() => {
      if (status === "loading") {
        if (config.debug) console.warn("[AuthWorker] Authentication timed out");
        setStatus("error");
        setError("Authentication timed out");
        resolveAuth(null);
      }
    }, 1e4);
    const handleMessage = (event) => {
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (data.type === "distri:token") {
        if (config.debug) console.log("[AuthWorker] Received token from provisioner");
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setToken(data.token);
        setStatus("authenticated");
        resolveAuth(data.token);
      } else if (data.type === "distri:error") {
        if (config.debug) console.error("[AuthWorker] Error from provisioner:", data.error);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setError(data.error);
        setStatus("error");
        resolveAuth(null);
      } else if (data.type === "distri:ready") {
        if (config.debug) console.log("[AuthWorker] Provisioner ready, triggering refresh");
        iframeRef.current?.contentWindow?.postMessage({ type: "distri:refresh_token" }, "*");
      }
    };
    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [status, config, setStatus, setToken, setError, resolveAuth]);
  const provisionerUrl = (0, import_react24.useMemo)(() => {
    const embedBase = "https://embed.distri.dev";
    const params = new URLSearchParams({
      clientId: config.clientId,
      mode: "token",
      theme: config.theme,
      baseUrl: config.baseUrl
    });
    return `${embedBase}?${params.toString()}`;
  }, [config]);
  const containerClass = `relative flex flex-col items-center justify-center p-8 text-center min-h-[400px] w-full bg-background animate-in fade-in duration-300 ${className}`;
  if (status === "loading") {
    return /* @__PURE__ */ (0, import_jsx_runtime26.jsxs)("div", { className: containerClass, children: [
      /* @__PURE__ */ (0, import_jsx_runtime26.jsx)(import_lucide_react11.Loader2, { className: "h-8 w-8 animate-spin text-primary mb-4" }),
      /* @__PURE__ */ (0, import_jsx_runtime26.jsx)("p", { className: "text-muted-foreground font-sans text-sm animate-pulse font-medium", children: "Initializing Security\u2026" }),
      /* @__PURE__ */ (0, import_jsx_runtime26.jsx)(
        "iframe",
        {
          ref: iframeRef,
          src: provisionerUrl,
          style: {
            display: "none",
            width: 0,
            height: 0,
            border: "none",
            position: "absolute",
            pointerEvents: "none",
            zIndex: -1
          },
          title: "distri-auth-provisioner"
        }
      )
    ] });
  }
  if (status === "error") {
    return /* @__PURE__ */ (0, import_jsx_runtime26.jsxs)("div", { className: containerClass, children: [
      /* @__PURE__ */ (0, import_jsx_runtime26.jsx)(import_lucide_react11.AlertCircle, { className: "h-12 w-12 text-destructive mb-4" }),
      /* @__PURE__ */ (0, import_jsx_runtime26.jsx)("h2", { className: "text-lg font-semibold text-foreground mb-2", children: "Authentication Failed" }),
      /* @__PURE__ */ (0, import_jsx_runtime26.jsx)("p", { className: "text-muted-foreground font-sans text-sm mb-6 max-w-xs", children: error || "Could not establish a secure connection." }),
      /* @__PURE__ */ (0, import_jsx_runtime26.jsx)(
        "button",
        {
          onClick: () => requestAuth(),
          className: "px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-all active:scale-95 shadow-sm",
          children: "Retry Connection"
        }
      )
    ] });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime26.jsx)(import_jsx_runtime26.Fragment, { children });
};

// src/components/Chat.tsx
var import_lucide_react12 = require("lucide-react");
var import_jsx_runtime27 = require("react/jsx-runtime");
var RendererWrapper2 = ({
  children,
  className = ""
}) => /* @__PURE__ */ (0, import_jsx_runtime27.jsx)("div", { className: `max-w-3xl mx-auto w-full ${className}`, children });
var getThemeClasses = (theme) => {
  if (theme === "dark") return "dark";
  if (theme === "light") return "light";
  return "";
};
var ChatInner = (0, import_react25.forwardRef)(function ChatInner2({
  threadId,
  agent,
  onMessage,
  onError,
  getMetadata: getMetadataProp,
  externalTools,
  executionOptions,
  initialMessages,
  theme = "auto",
  models,
  selectedModelId,
  beforeSendMessage,
  onModelChange,
  onChatInstanceReady,
  onChatStateChange,
  onTaskFinish,
  renderEmptyState,
  emptyState: emptyStateProp,
  starterCommands,
  loadingAnimation,
  renderLoadingAnimation,
  voiceEnabled = false,
  useSpeechRecognition: useSpeechRecognition2 = false,
  ttsConfig,
  initialInput = "",
  allowBrowserPreview = true,
  maxWidth,
  className = "",
  toolRenderers,
  debug = false,
  enableFeedback = false
}, ref) {
  const [input, setInput] = (0, import_react25.useState)(initialInput ?? "");
  const initialInputRef = (0, import_react25.useRef)(initialInput ?? "");
  const [expandedTools, setExpandedTools] = (0, import_react25.useState)(/* @__PURE__ */ new Set());
  const messagesEndRef = (0, import_react25.useRef)(null);
  const [pendingMessage, setPendingMessage] = (0, import_react25.useState)(null);
  const [attachedImages, setAttachedImages] = (0, import_react25.useState)([]);
  const [isDragOver, setIsDragOver] = (0, import_react25.useState)(false);
  const speechToText = useSpeechToText();
  const tts = useTts();
  const [isStreamingVoice, setIsStreamingVoice] = (0, import_react25.useState)(false);
  const [streamingTranscript, setStreamingTranscript] = (0, import_react25.useState)("");
  const [audioChunks, setAudioChunks] = (0, import_react25.useState)([]);
  const [browserEnabled, setBrowserEnabled] = (0, import_react25.useState)(false);
  const browserViewerUrl = useChatStateStore((state) => state.browserViewerUrl);
  const agentDefinition = (0, import_react25.useMemo)(() => agent?.getDefinition(), [agent]);
  const supportsBrowserStreaming = allowBrowserPreview && Boolean(agentDefinition?.browser_config);
  const browserAgentIdRef = (0, import_react25.useRef)(void 0);
  (0, import_react25.useEffect)(() => {
    const agentId = agentDefinition?.id;
    if (!agentDefinition || !supportsBrowserStreaming) {
      setBrowserEnabled(false);
      browserAgentIdRef.current = agentId;
      return;
    }
    if (browserAgentIdRef.current !== agentId) {
      browserAgentIdRef.current = agentId;
      const defaultEnabled = agentDefinition.browser_config?.enabled ?? false;
      setBrowserEnabled(defaultEnabled);
    }
  }, [agentDefinition, supportsBrowserStreaming]);
  (0, import_react25.useEffect)(() => {
    if (typeof initialInput === "string" && initialInput !== initialInputRef.current) {
      setInput(initialInput);
      initialInputRef.current = initialInput;
    }
  }, [initialInput]);
  const browserSessionId = useChatStateStore((state) => state.browserSessionId);
  const mergedMetadataProvider = (0, import_react25.useCallback)(async () => {
    const baseMetadata = await getMetadataProp?.() ?? {};
    const existingOverrides = baseMetadata.definition_overrides ?? {};
    const overrides = supportsBrowserStreaming ? { ...existingOverrides, use_browser: browserEnabled } : existingOverrides;
    return {
      ...baseMetadata,
      definition_overrides: overrides,
      // Include browser_session_id if we have one so browsr reuses the same session
      ...browserSessionId ? { browser_session_id: browserSessionId } : {}
    };
  }, [browserEnabled, browserSessionId, getMetadataProp, supportsBrowserStreaming]);
  const {
    sendMessage,
    stopStreaming,
    isStreaming,
    isLoading,
    error,
    messages
  } = useChat({
    threadId,
    agent,
    onMessage,
    onError,
    getMetadata: mergedMetadataProvider,
    externalTools,
    executionOptions,
    initialMessages,
    beforeSendMessage
  });
  const emptyState = (0, import_react25.useMemo)(() => {
    if (!emptyStateProp && !starterCommands) return void 0;
    const starterCategory = starterCommands && starterCommands.length > 0 ? { id: "_starter_commands", starters: starterCommands } : null;
    if (!emptyStateProp) {
      return starterCategory ? { categories: [starterCategory] } : void 0;
    }
    if (starterCategory) {
      const existingCategories = emptyStateProp.categories ?? [];
      return {
        ...emptyStateProp,
        categories: [...existingCategories, starterCategory]
      };
    }
    return emptyStateProp;
  }, [emptyStateProp, starterCommands]);
  const toolCalls = useChatStateStore((state) => state.toolCalls);
  const hasPendingToolCalls = useChatStateStore((state) => state.hasPendingToolCalls());
  const streamingIndicator = useChatStateStore((state) => state.streamingIndicator);
  const currentThought = useChatStateStore((state) => state.currentThought);
  const currentState = useChatStateStore((state) => state);
  const todos = useChatStateStore((state) => state.todos);
  (0, import_react25.useEffect)(() => {
    if (onChatStateChange) {
      onChatStateChange(currentState);
    }
  }, [currentState, onChatStateChange]);
  const { client: distriClient } = useDistri();
  const handleToggleBrowser = (0, import_react25.useCallback)(async (enabled) => {
    if (!supportsBrowserStreaming) return;
    setBrowserEnabled(enabled);
    if (enabled && !browserSessionId && distriClient) {
      try {
        const session = await distriClient.createBrowserSession();
        useChatStateStore.getState().setBrowserSession(session.session_id, session.viewer_url);
      } catch (err) {
        console.error("Failed to create browser session:", err);
      }
    }
  }, [supportsBrowserStreaming, browserSessionId, distriClient]);
  const addImages = (0, import_react25.useCallback)(async (files) => {
    const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));
    for (const file of imageFiles) {
      const id = Date.now().toString() + Math.random().toString(36).substring(2, 11);
      const preview = URL.createObjectURL(file);
      const newImage = {
        id,
        file,
        preview,
        name: file.name
      };
      setAttachedImages((prev) => [...prev, newImage]);
    }
  }, []);
  const removeImage = (0, import_react25.useCallback)((id) => {
    setAttachedImages((prev) => {
      const image = prev.find((img) => img.id === id);
      if (image) {
        URL.revokeObjectURL(image.preview);
      }
      return prev.filter((img) => img.id !== id);
    });
  }, []);
  const handleDragOver = (0, import_react25.useCallback)((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);
  const handleDragLeave = (0, import_react25.useCallback)((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setIsDragOver(false);
    }
  }, []);
  const handleDrop = (0, import_react25.useCallback)((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      addImages(files);
    }
  }, [addImages]);
  const contentToParts = (0, import_react25.useCallback)((content) => {
    if (typeof content === "string") {
      return [{ part_type: "text", data: content }];
    }
    return content;
  }, []);
  const handleSendMessage = (0, import_react25.useCallback)(async (content) => {
    if (typeof content === "string" && !content.trim()) return;
    if (Array.isArray(content) && content.length === 0) return;
    setInput("");
    setAttachedImages((prev) => {
      prev.forEach((img) => URL.revokeObjectURL(img.preview));
      return [];
    });
    if (isStreaming) {
      const newParts = contentToParts(content);
      setPendingMessage((prev) => prev ? [...prev, ...newParts] : newParts);
    } else {
      await sendMessage(content);
    }
  }, [sendMessage, isStreaming, contentToParts]);
  const handleStopStreaming = (0, import_react25.useCallback)(() => {
    console.log("handleStopStreaming called, about to call stopStreaming()");
    stopStreaming();
    useChatStateStore.getState().resetStreamingStates();
  }, [stopStreaming]);
  const handleTriggerTool = (0, import_react25.useCallback)(async (toolName, input2) => {
    const toolCallId = `manual_${Date.now()}_${Math.random().toString(36).substring(2, 11)} `;
    const toolCall = {
      tool_call_id: toolCallId,
      tool_name: toolName,
      input: input2
    };
    const chatState = useChatStateStore.getState();
    const tool = chatState.getToolByName(toolName);
    if (tool) {
      chatState.executeTool(toolCall, tool);
    } else {
      console.error("Tool not found:", toolName);
    }
  }, []);
  const handleVoiceRecord = (0, import_react25.useCallback)(async (audioBlob) => {
    try {
      if (!voiceEnabled || !speechToText) {
        console.error("Voice recording not properly configured - missing speechToText");
        return;
      }
      const transcription = await speechToText.transcribe(audioBlob, { model: "whisper-1" });
      if (transcription.trim()) {
        setInput(transcription);
        await handleSendMessage(transcription);
      }
    } catch (error2) {
      console.error("Voice transcription failed:", error2);
      if (onError) {
        onError(error2);
      }
    }
  }, [voiceEnabled, speechToText, handleSendMessage, onError]);
  const startStreamingVoice = (0, import_react25.useCallback)(async () => {
    if (!voiceEnabled || isStreamingVoice || !speechToText) {
      console.error("Cannot start streaming voice - missing requirements");
      return;
    }
    setIsStreamingVoice(true);
    setStreamingTranscript("");
    setAudioChunks([]);
    try {
      await speechToText.startStreamingTranscription({
        onTranscript: (text, isFinal) => {
          setStreamingTranscript(text);
          if (isFinal && text.trim()) {
            handleSendMessage(text);
            setStreamingTranscript("");
          }
        },
        onError: (error2) => {
          console.error("Streaming transcription error:", error2);
          if (onError) onError(error2);
          setIsStreamingVoice(false);
        },
        onEnd: () => {
          setIsStreamingVoice(false);
        }
      });
      tts.startStreamingTts({
        voice: ttsConfig?.voice || "alloy",
        speed: ttsConfig?.speed || 1,
        onAudioChunk: (audioData) => {
          setAudioChunks((prev) => [...prev, audioData]);
        },
        onTextChunk: (text, _isFinal) => {
          console.log("AI speaking:", text);
        },
        onError: (error2) => {
          console.error("Streaming TTS error:", error2);
          if (onError) onError(error2);
        },
        onEnd: () => {
          if (audioChunks.length > 0) {
            tts.streamingPlayAudio(audioChunks).catch(console.error);
          }
          setAudioChunks([]);
        }
      });
    } catch (error2) {
      console.error("Failed to start streaming voice:", error2);
      if (onError) onError(error2);
      setIsStreamingVoice(false);
    }
  }, [voiceEnabled, isStreamingVoice, speechToText, tts, ttsConfig, handleSendMessage, onError, audioChunks]);
  const stopStreamingVoice = (0, import_react25.useCallback)(() => {
    if (!isStreamingVoice) return;
    if (speechToText) {
      speechToText.stopStreamingTranscription();
    }
    tts.stopStreamingTts();
    setIsStreamingVoice(false);
    setStreamingTranscript("");
    setAudioChunks([]);
  }, [isStreamingVoice, speechToText, tts]);
  const handleSpeechTranscript = (0, import_react25.useCallback)(async (transcript) => {
    if (transcript.trim()) {
      await handleSendMessage(transcript);
    }
  }, [handleSendMessage]);
  (0, import_react25.useEffect)(() => {
    const sendPendingMessage = async () => {
      if (!isStreaming && pendingMessage && pendingMessage.length > 0) {
        console.log("Streaming ended, sending pending message parts:", pendingMessage);
        const messageToSend = [...pendingMessage];
        setPendingMessage(null);
        try {
          await sendMessage(messageToSend);
        } catch (error2) {
          console.error("Failed to send pending message:", error2);
        }
      }
    };
    sendPendingMessage();
  }, [isStreaming, pendingMessage, sendMessage]);
  (0, import_react25.useEffect)(() => {
    if (!voiceEnabled || !ttsConfig || isStreamingVoice) return;
    const lastMessage = messages[messages.length - 1];
    if (lastMessage && "role" in lastMessage && lastMessage.role === "assistant" && "content" in lastMessage && typeof lastMessage.content === "string") {
      tts.synthesize({
        text: lastMessage.content,
        model: ttsConfig.model || "openai",
        voice: ttsConfig.voice,
        speed: ttsConfig.speed
      }).then((audioBlob) => tts.playAudio(audioBlob)).catch((error2) => console.error("TTS playback failed:", error2));
    }
  }, [messages, voiceEnabled, ttsConfig, tts, isStreamingVoice]);
  const chatInstance = (0, import_react25.useMemo)(() => ({
    sendMessage: handleSendMessage,
    stopStreaming: handleStopStreaming,
    triggerTool: handleTriggerTool,
    isStreaming,
    isLoading,
    // Streaming voice capabilities - only available with speechToText
    startStreamingVoice: voiceEnabled && speechToText ? startStreamingVoice : void 0,
    stopStreamingVoice: voiceEnabled && speechToText ? stopStreamingVoice : void 0,
    isStreamingVoice: voiceEnabled && speechToText ? isStreamingVoice : void 0,
    streamingTranscript: voiceEnabled && speechToText ? streamingTranscript : void 0
  }), [handleSendMessage, handleStopStreaming, handleTriggerTool, isStreaming, isLoading, voiceEnabled, speechToText, startStreamingVoice, stopStreamingVoice, isStreamingVoice, streamingTranscript]);
  (0, import_react25.useImperativeHandle)(ref, () => chatInstance, [chatInstance]);
  (0, import_react25.useEffect)(() => {
    if (onChatInstanceReady) {
      onChatInstanceReady(chatInstance);
    }
  }, [onChatInstanceReady, chatInstance]);
  const completedTaskIdsRef = (0, import_react25.useRef)(/* @__PURE__ */ new Set());
  (0, import_react25.useEffect)(() => {
    if (!onTaskFinish) return;
    const unsub = useChatStateStore.subscribe((state) => state.tasks);
    const tasks = useChatStateStore.getState().tasks;
    tasks.forEach((task) => {
      if (task.status === "completed" && !completedTaskIdsRef.current.has(task.id)) {
        completedTaskIdsRef.current.add(task.id);
        onTaskFinish(task);
      }
    });
    return () => unsub();
  }, [onTaskFinish]);
  const toggleToolExpansion = (0, import_react25.useCallback)((toolId) => {
    setExpandedTools((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(toolId)) {
        newSet.delete(toolId);
      } else {
        newSet.add(toolId);
      }
      return newSet;
    });
  }, []);
  (0, import_react25.useEffect)(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);
  (0, import_react25.useEffect)(() => {
    const newExpanded = new Set(expandedTools);
    let hasChanges = false;
    toolCalls.forEach((toolCall) => {
      if (toolCall.status === "running" || toolCall.status === "error" || toolCall.status === "user_action_required") {
        if (!newExpanded.has(toolCall.tool_call_id)) {
          newExpanded.add(toolCall.tool_call_id);
          hasChanges = true;
        }
      }
    });
    if (hasChanges) {
      setExpandedTools(newExpanded);
    }
  }, [toolCalls, expandedTools]);
  const renderMessages = () => {
    const elements = [];
    messages.forEach((message, index) => {
      const renderedMessage = /* @__PURE__ */ (0, import_jsx_runtime27.jsx)(
        MessageRenderer,
        {
          message,
          index,
          toolRenderers,
          isExpanded: expandedTools.has(message.id || `message-${index}`),
          onToggle: () => {
            const messageId = message.id || `message-${index}`;
            toggleToolExpansion(messageId);
          },
          debug,
          threadId,
          enableFeedback
        },
        `message-${index}`
      );
      if (renderedMessage !== null) {
        elements.push(renderedMessage);
      }
    });
    return elements;
  };
  const renderExternalToolCalls = () => {
    const elements = [];
    const externalToolCalls = Array.from(toolCalls.values()).filter(
      (toolCall) => (toolCall.status === "pending" || toolCall.status === "running") && toolCall.isExternal && toolCall.component
    );
    externalToolCalls.forEach((toolCall) => {
      elements.push(
        /* @__PURE__ */ (0, import_jsx_runtime27.jsx)(RendererWrapper2, { children: toolCall.component }, `external-tool-${toolCall.tool_call_id}`)
      );
    });
    return elements;
  };
  const showEmptyState = messages.length === 0 && !isLoading && !error;
  const submitFromEmptyState = (0, import_react25.useCallback)(async (value) => {
    console.log("[Chat] submitFromEmptyState called with:", value);
    if (typeof value === "string" || Array.isArray(value)) {
      console.log("[Chat] Sending message:", value);
      await handleSendMessage(value);
      return;
    }
    console.log("[Chat] Sending input:", input);
    await handleSendMessage(input);
  }, [handleSendMessage, input]);
  const setComposerInput = (0, import_react25.useCallback)((value) => {
    setInput(value);
  }, [setInput]);
  const emptyStateController = (0, import_react25.useMemo)(() => ({
    input,
    setInput: setComposerInput,
    submit: submitFromEmptyState,
    isLoading,
    isStreaming
  }), [input, setComposerInput, submitFromEmptyState, isLoading, isStreaming]);
  const renderComposer = (0, import_react25.useCallback)((variant, className2) => {
    const basePlaceholder = showEmptyState && emptyState?.promptPlaceholder ? emptyState.promptPlaceholder : "Type your message\u2026";
    return /* @__PURE__ */ (0, import_jsx_runtime27.jsx)(
      ChatInput,
      {
        value: input,
        onChange: setInput,
        onSend: handleSendMessage,
        onStop: handleStopStreaming,
        browserEnabled: supportsBrowserStreaming && browserEnabled,
        browserHasSession: Boolean(browserSessionId),
        onToggleBrowser: supportsBrowserStreaming ? handleToggleBrowser : void 0,
        placeholder: isStreamingVoice ? "Voice mode active\u2026" : isStreaming ? "Message will be queued\u2026" : basePlaceholder,
        disabled: isLoading || hasPendingToolCalls || isStreamingVoice,
        isStreaming,
        attachedImages,
        onRemoveImage: removeImage,
        onAddImages: addImages,
        voiceEnabled: voiceEnabled && !!speechToText,
        onVoiceRecord: handleVoiceRecord,
        onStartStreamingVoice: voiceEnabled && speechToText ? startStreamingVoice : void 0,
        isStreamingVoice,
        useSpeechRecognition: useSpeechRecognition2,
        onSpeechTranscript: handleSpeechTranscript,
        className: className2,
        variant,
        theme
      }
    );
  }, [
    input,
    setInput,
    handleSendMessage,
    handleStopStreaming,
    browserEnabled,
    browserSessionId,
    supportsBrowserStreaming,
    handleToggleBrowser,
    isStreamingVoice,
    isStreaming,
    isLoading,
    hasPendingToolCalls,
    attachedImages,
    removeImage,
    addImages,
    voiceEnabled,
    speechToText,
    handleVoiceRecord,
    startStreamingVoice,
    useSpeechRecognition2,
    handleSpeechTranscript,
    showEmptyState,
    emptyState,
    theme
  ]);
  const emptyStateComposer = (0, import_react25.useMemo)(() => {
    const baseClass = "w-full mx-auto empty-state-composer";
    const className2 = maxWidth ? baseClass : `${baseClass} max-w-2xl`;
    const composer = renderComposer("hero", className2);
    if (maxWidth) {
      return /* @__PURE__ */ (0, import_jsx_runtime27.jsx)("div", { style: { maxWidth }, children: composer });
    }
    return composer;
  }, [renderComposer, maxWidth]);
  const footerComposer = (0, import_react25.useMemo)(() => renderComposer("default", "w-full"), [renderComposer]);
  const controllerWithComposer = (0, import_react25.useMemo)(() => ({
    ...emptyStateController,
    composer: emptyStateComposer
  }), [emptyStateController, emptyStateComposer]);
  const emptyStateContent = (0, import_react25.useMemo)(() => {
    if (!showEmptyState) {
      return null;
    }
    if (renderEmptyState) {
      return renderEmptyState(controllerWithComposer);
    }
    return /* @__PURE__ */ (0, import_jsx_runtime27.jsx)(DefaultChatEmptyState, { controller: controllerWithComposer, options: emptyState, maxWidth });
  }, [showEmptyState, renderEmptyState, controllerWithComposer, emptyState, maxWidth]);
  const shouldRenderFooterComposer = !showEmptyState || Boolean(renderEmptyState);
  const footerHasContent = shouldRenderFooterComposer || models && models.length > 0 || voiceEnabled && speechToText && (isStreamingVoice || streamingTranscript);
  const showBrowserPreview = supportsBrowserStreaming && browserEnabled && Boolean(browserViewerUrl);
  const renderThinkingIndicator = () => {
    if (streamingIndicator === "typing") {
      if (renderLoadingAnimation) {
        return /* @__PURE__ */ (0, import_jsx_runtime27.jsx)(RendererWrapper2, { className: "distri-typing-indicator", children: renderLoadingAnimation() }, `typing-indicator`);
      }
      if (loadingAnimation) {
        return /* @__PURE__ */ (0, import_jsx_runtime27.jsx)(RendererWrapper2, { className: "distri-typing-indicator", children: /* @__PURE__ */ (0, import_jsx_runtime27.jsx)(LoadingAnimation, { config: loadingAnimation }) }, `typing-indicator`);
      }
      return /* @__PURE__ */ (0, import_jsx_runtime27.jsx)(RendererWrapper2, { className: "distri-typing-indicator", children: /* @__PURE__ */ (0, import_jsx_runtime27.jsx)(TypingIndicator, {}) }, `typing-indicator`);
    } else if (streamingIndicator) {
      return /* @__PURE__ */ (0, import_jsx_runtime27.jsx)(RendererWrapper2, { className: "distri-thinking-indicator", children: /* @__PURE__ */ (0, import_jsx_runtime27.jsx)(
        ThinkingRenderer,
        {
          indicator: streamingIndicator,
          thoughtText: currentThought
        }
      ) }, `thinking-${streamingIndicator}`);
    }
    return null;
  };
  const renderPendingMessage = () => {
    if (!pendingMessage || pendingMessage.length === 0) return null;
    const partCount = pendingMessage.length;
    return /* @__PURE__ */ (0, import_jsx_runtime27.jsx)(RendererWrapper2, { children: /* @__PURE__ */ (0, import_jsx_runtime27.jsx)("div", { className: "border-l-4 border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-r-lg", children: /* @__PURE__ */ (0, import_jsx_runtime27.jsxs)("div", { className: "flex items-start", children: [
      /* @__PURE__ */ (0, import_jsx_runtime27.jsx)("div", { className: "flex-shrink-0", children: /* @__PURE__ */ (0, import_jsx_runtime27.jsx)("div", { className: "w-2 h-2 bg-yellow-400 rounded-full animate-pulse mt-2" }) }),
      /* @__PURE__ */ (0, import_jsx_runtime27.jsxs)("div", { className: "ml-3 flex-1", children: [
        /* @__PURE__ */ (0, import_jsx_runtime27.jsxs)("h3", { className: "text-sm font-medium text-yellow-800 dark:text-yellow-200", children: [
          "Message queued (",
          partCount,
          " part",
          partCount > 1 ? "s" : "",
          ")"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime27.jsx)("div", { className: "mt-2", children: /* @__PURE__ */ (0, import_jsx_runtime27.jsx)("div", { className: "text-sm text-yellow-700 dark:text-yellow-300 bg-white dark:bg-gray-800 p-2 rounded border", children: pendingMessage.map((part, partIndex) => {
          if (part.part_type === "text") {
            return /* @__PURE__ */ (0, import_jsx_runtime27.jsx)("span", { className: "block mb-1", children: part.data }, partIndex);
          } else if (part.part_type === "image" && typeof part.data === "object" && part.data !== null && "name" in part.data) {
            return /* @__PURE__ */ (0, import_jsx_runtime27.jsxs)("span", { className: "inline-block text-xs text-muted-foreground bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded mr-2 mb-1", children: [
              "\u{1F4F7} ",
              part.data.name
            ] }, partIndex);
          }
          return /* @__PURE__ */ (0, import_jsx_runtime27.jsxs)("span", { className: "inline-block text-xs text-muted-foreground bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded mr-2 mb-1", children: [
            "[",
            part.part_type,
            "]"
          ] }, partIndex);
        }) }) }),
        /* @__PURE__ */ (0, import_jsx_runtime27.jsx)("p", { className: "mt-2 text-xs text-yellow-600 dark:text-yellow-400", children: "Will be sent automatically when AI response is complete" })
      ] })
    ] }) }) }, "pending-message");
  };
  if (!agent)
    return /* @__PURE__ */ (0, import_jsx_runtime27.jsx)("div", { children: " Agent not available" });
  return /* @__PURE__ */ (0, import_jsx_runtime27.jsxs)(
    "div",
    {
      className: `flex flex-col h-full bg-background font-sans overflow-hidden relative ${getThemeClasses(theme)} ${className}`,
      style: { maxWidth },
      onDragOver: handleDragOver,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop,
      children: [
        isDragOver && /* @__PURE__ */ (0, import_jsx_runtime27.jsx)("div", { className: "absolute inset-0 z-50 flex items-center justify-center bg-primary/10 border-2 border-primary border-dashed", children: /* @__PURE__ */ (0, import_jsx_runtime27.jsx)("div", { className: "text-primary font-medium text-lg", children: "Drop images anywhere to upload" }) }),
        /* @__PURE__ */ (0, import_jsx_runtime27.jsx)("div", { className: "flex-1 overflow-y-auto bg-background text-foreground selection:bg-primary/20 selection:text-primary-foreground dark:selection:bg-primary/40", children: /* @__PURE__ */ (0, import_jsx_runtime27.jsxs)(
          "div",
          {
            className: "mx-auto w-full px-2 py-4 text-sm space-y-4",
            style: { maxWidth: maxWidth || "768px", width: "100%", boxSizing: "border-box" },
            children: [
              error && /* @__PURE__ */ (0, import_jsx_runtime27.jsx)("div", { className: "p-4 bg-destructive/10 border-l-4 border-destructive", children: /* @__PURE__ */ (0, import_jsx_runtime27.jsxs)("div", { className: "text-destructive text-xs", children: [
                /* @__PURE__ */ (0, import_jsx_runtime27.jsx)("strong", { children: "Error:" }),
                " ",
                error.message
              ] }) }),
              todos && todos.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime27.jsx)(TodosDisplay, { todos, className: "mb-4" }),
              /* @__PURE__ */ (0, import_jsx_runtime27.jsxs)(
                "div",
                {
                  className: "flex flex-col gap-4 lg:flex-row lg:items-start",
                  style: maxWidth ? { maxWidth: "100%" } : void 0,
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime27.jsx)(MessageReadProvider, { threadId, enabled: enableFeedback, children: /* @__PURE__ */ (0, import_jsx_runtime27.jsxs)("div", { className: "flex-1 min-w-0 space-y-4 w-full", children: [
                      emptyStateContent,
                      renderMessages(),
                      renderExternalToolCalls(),
                      renderThinkingIndicator(),
                      renderPendingMessage(),
                      /* @__PURE__ */ (0, import_jsx_runtime27.jsx)("div", { ref: messagesEndRef })
                    ] }) }),
                    showBrowserPreview && browserViewerUrl && /* @__PURE__ */ (0, import_jsx_runtime27.jsx)("div", { className: "w-full lg:w-[320px] xl:w-[360px] shrink-0", children: /* @__PURE__ */ (0, import_jsx_runtime27.jsx)("div", { className: "lg:sticky lg:top-4 space-y-3", children: /* @__PURE__ */ (0, import_jsx_runtime27.jsx)("div", { className: "overflow-hidden rounded-xl border border-border/40 bg-background", children: /* @__PURE__ */ (0, import_jsx_runtime27.jsx)(
                      "iframe",
                      {
                        src: browserViewerUrl,
                        className: "h-[400px] w-full border-0",
                        title: "Browser Viewer",
                        sandbox: "allow-scripts allow-same-origin allow-forms"
                      }
                    ) }) }) })
                  ]
                }
              )
            ]
          }
        ) }),
        footerHasContent ? /* @__PURE__ */ (0, import_jsx_runtime27.jsx)("footer", { className: "\n  sticky bottom-0 inset-x-0 z-30\n  border-t border-border\n  bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60\n  pb-[env(safe-area-inset-bottom)]\n", children: /* @__PURE__ */ (0, import_jsx_runtime27.jsxs)(
          "div",
          {
            className: "mx-auto w-full px-4 py-3 sm:py-4 space-y-3",
            style: { maxWidth: maxWidth || "768px" },
            children: [
              models && models.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime27.jsxs)("div", { className: "flex flex-wrap items-center gap-2", children: [
                /* @__PURE__ */ (0, import_jsx_runtime27.jsx)("span", { className: "text-sm text-muted-foreground shrink-0", children: "Model:" }),
                /* @__PURE__ */ (0, import_jsx_runtime27.jsxs)(Select, { value: selectedModelId, onValueChange: onModelChange, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime27.jsx)(SelectTrigger, { className: "w-64 max-w-full", children: /* @__PURE__ */ (0, import_jsx_runtime27.jsx)(SelectValue, { placeholder: "Select a model" }) }),
                  /* @__PURE__ */ (0, import_jsx_runtime27.jsx)(SelectContent, { children: models.map((model) => /* @__PURE__ */ (0, import_jsx_runtime27.jsx)(SelectItem, { value: model.id, children: model.name }, model.id)) })
                ] })
              ] }),
              voiceEnabled && speechToText && (isStreamingVoice || streamingTranscript) && /* @__PURE__ */ (0, import_jsx_runtime27.jsxs)("div", { className: "p-3 bg-muted/50 border border-muted rounded-lg", children: [
                /* @__PURE__ */ (0, import_jsx_runtime27.jsxs)("div", { className: "flex items-center gap-2", children: [
                  /* @__PURE__ */ (0, import_jsx_runtime27.jsx)("span", { className: "w-2 h-2 rounded-full bg-red-500 animate-pulse" }),
                  /* @__PURE__ */ (0, import_jsx_runtime27.jsx)("span", { className: "text-sm font-medium text-muted-foreground", children: isStreamingVoice ? "Listening\u2026" : "Processing\u2026" }),
                  isStreamingVoice && /* @__PURE__ */ (0, import_jsx_runtime27.jsx)(
                    "button",
                    {
                      onClick: stopStreamingVoice,
                      className: "ml-auto text-xs px-2 py-1 bg-destructive text-destructive-foreground rounded",
                      children: "Stop"
                    }
                  )
                ] }),
                streamingTranscript && /* @__PURE__ */ (0, import_jsx_runtime27.jsxs)("p", { className: "mt-2 text-sm text-foreground font-mono break-words", children: [
                  "\u201C",
                  streamingTranscript,
                  "\u201D"
                ] })
              ] }),
              shouldRenderFooterComposer ? footerComposer : null
            ]
          }
        ) }) : null
      ]
    }
  );
});
var Chat = (0, import_react25.forwardRef)((props, ref) => {
  return /* @__PURE__ */ (0, import_jsx_runtime27.jsx)(AuthLoading, { children: /* @__PURE__ */ (0, import_jsx_runtime27.jsx)(ChatContainer, { ref, ...props }) });
});
var ChatContainer = (0, import_react25.forwardRef)(function ChatContainer2({ agent: agentProp, agentId, enableHistory, threadId, initialMessages: initialMessagesProp, theme, enableFeedback, ...props }, ref) {
  const { isLoading: clientLoading } = useDistri();
  const { agent: fetchedAgent, loading: agentLoading } = useAgent({
    agentIdOrDef: agentId || "",
    enabled: !agentProp && !!agentId
  });
  const agent = agentProp || fetchedAgent;
  const { messages: fetchedMessages, isLoading: historyLoading } = useChatMessages({
    threadId,
    enabled: !!enableHistory && !initialMessagesProp && !!threadId
  });
  const initialMessages = initialMessagesProp || fetchedMessages;
  if (clientLoading || agentLoading || enableHistory && historyLoading) {
    return /* @__PURE__ */ (0, import_jsx_runtime27.jsxs)("div", { className: `flex flex-col items-center justify-center p-8 text-center h-full bg-background ${getThemeClasses(theme || "auto")}`, children: [
      /* @__PURE__ */ (0, import_jsx_runtime27.jsx)(import_lucide_react12.Loader2, { className: "h-8 w-8 animate-spin text-primary mb-4" }),
      /* @__PURE__ */ (0, import_jsx_runtime27.jsx)("p", { className: "text-muted-foreground font-sans text-sm", children: "Initializing..." })
    ] });
  }
  if (!agent) {
    return /* @__PURE__ */ (0, import_jsx_runtime27.jsxs)("div", { className: `flex flex-col items-center justify-center p-8 text-center h-full bg-background ${getThemeClasses(theme || "auto")}`, children: [
      /* @__PURE__ */ (0, import_jsx_runtime27.jsx)(import_lucide_react12.AlertCircle, { className: "h-12 w-12 text-amber-500 mb-4" }),
      /* @__PURE__ */ (0, import_jsx_runtime27.jsx)("h2", { className: "text-lg font-semibold text-foreground mb-2", children: "Agent Not Available" }),
      /* @__PURE__ */ (0, import_jsx_runtime27.jsx)("p", { className: "text-muted-foreground font-sans text-sm mb-4", children: "No agent has been configured or the backend is not responding." }),
      /* @__PURE__ */ (0, import_jsx_runtime27.jsx)("p", { className: "text-muted-foreground font-sans text-xs", children: "Make sure your Distri backend is running and accessible." })
    ] });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime27.jsx)(ChatInner, { ref, agent, threadId, initialMessages, theme, enableFeedback, ...props });
});

// src/components/AgentList.tsx
var import_react26 = __toESM(require("react"), 1);
var import_lucide_react13 = require("lucide-react");
var import_jsx_runtime28 = require("react/jsx-runtime");

// src/components/AgentSelect.tsx
var import_lucide_react14 = require("lucide-react");
var import_jsx_runtime29 = require("react/jsx-runtime");
var AgentSelect = ({
  agents,
  selectedAgentId,
  onAgentSelect,
  className = "",
  placeholder = "Select an agent...",
  disabled = false
}) => {
  const selectedAgent = agents.find((agent) => agent.id === selectedAgentId);
  return /* @__PURE__ */ (0, import_jsx_runtime29.jsxs)(Select, { value: selectedAgentId, onValueChange: onAgentSelect, disabled, children: [
    /* @__PURE__ */ (0, import_jsx_runtime29.jsx)(SelectTrigger, { className: `w-full ${className} ${disabled ? "opacity-50 cursor-not-allowed" : ""}`, children: /* @__PURE__ */ (0, import_jsx_runtime29.jsxs)("div", { className: "flex items-center space-x-2", children: [
      /* @__PURE__ */ (0, import_jsx_runtime29.jsx)(import_lucide_react14.Bot, { className: "h-4 w-4" }),
      /* @__PURE__ */ (0, import_jsx_runtime29.jsx)(SelectValue, { placeholder, children: selectedAgent?.name || placeholder })
    ] }) }),
    /* @__PURE__ */ (0, import_jsx_runtime29.jsx)(SelectContent, { children: agents.map((agent) => /* @__PURE__ */ (0, import_jsx_runtime29.jsx)(SelectItem, { value: agent.id, children: /* @__PURE__ */ (0, import_jsx_runtime29.jsxs)("div", { className: "flex items-center space-x-2", children: [
      /* @__PURE__ */ (0, import_jsx_runtime29.jsx)(import_lucide_react14.Bot, { className: "h-4 w-4" }),
      /* @__PURE__ */ (0, import_jsx_runtime29.jsxs)("div", { className: "flex flex-col", children: [
        /* @__PURE__ */ (0, import_jsx_runtime29.jsx)("span", { className: "font-medium", children: agent.name }),
        agent.description && /* @__PURE__ */ (0, import_jsx_runtime29.jsx)("span", { className: "text-xs text-muted-foreground", children: agent.description })
      ] })
    ] }) }, agent.id)) })
  ] });
};

// src/components/AgentsPage.tsx
var import_jsx_runtime30 = require("react/jsx-runtime");

// src/components/AppSidebar.tsx
var import_react27 = require("react");
var import_lucide_react18 = require("lucide-react");

// src/components/ui/sidebar.tsx
var React23 = __toESM(require("react"), 1);
var import_react_slot = require("@radix-ui/react-slot");
var import_class_variance_authority2 = require("class-variance-authority");
var import_lucide_react16 = require("lucide-react");

// src/components/ui/separator.tsx
var React20 = __toESM(require("react"), 1);
var SeparatorPrimitive = __toESM(require("@radix-ui/react-separator"), 1);
var import_jsx_runtime31 = require("react/jsx-runtime");
var Separator2 = React20.forwardRef(
  ({ className, orientation = "horizontal", decorative = true, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime31.jsx)(
    SeparatorPrimitive.Root,
    {
      ref,
      decorative,
      orientation,
      className: cn(
        "shrink-0 bg-border",
        orientation === "horizontal" ? "h-[1px] w-full" : "h-full w-[1px]",
        className
      ),
      ...props
    }
  )
);
Separator2.displayName = SeparatorPrimitive.Root.displayName;

// src/components/ui/sheet.tsx
var React21 = __toESM(require("react"), 1);
var SheetPrimitive = __toESM(require("@radix-ui/react-dialog"), 1);
var import_class_variance_authority = require("class-variance-authority");
var import_lucide_react15 = require("lucide-react");
var import_jsx_runtime32 = require("react/jsx-runtime");
var Sheet = SheetPrimitive.Root;
var SheetPortal = SheetPrimitive.Portal;
var SheetOverlay = React21.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime32.jsx)(
  SheetPrimitive.Overlay,
  {
    className: cn(
      "fixed inset-0 z-50 bg-black/80  data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    ),
    ...props,
    ref
  }
));
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName;
var sheetVariants = (0, import_class_variance_authority.cva)(
  "fixed z-50 gap-4 bg-background p-6 shadow-lg transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-500",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        bottom: "inset-x-0 bottom-0 border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        left: "inset-y-0 left-0 h-full w-3/4 border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
        right: "inset-y-0 right-0 h-full w-3/4  border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm"
      }
    },
    defaultVariants: {
      side: "right"
    }
  }
);
var SheetContent = React21.forwardRef(({ side = "right", className, children, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime32.jsxs)(SheetPortal, { children: [
  /* @__PURE__ */ (0, import_jsx_runtime32.jsx)(SheetOverlay, {}),
  /* @__PURE__ */ (0, import_jsx_runtime32.jsxs)(
    SheetPrimitive.Content,
    {
      ref,
      className: cn(sheetVariants({ side }), className),
      ...props,
      children: [
        children,
        /* @__PURE__ */ (0, import_jsx_runtime32.jsxs)(SheetPrimitive.Close, { className: "absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary", children: [
          /* @__PURE__ */ (0, import_jsx_runtime32.jsx)(import_lucide_react15.X, { className: "h-4 w-4" }),
          /* @__PURE__ */ (0, import_jsx_runtime32.jsx)("span", { className: "sr-only", children: "Close" })
        ] })
      ]
    }
  )
] }));
SheetContent.displayName = SheetPrimitive.Content.displayName;
var SheetHeader = ({
  className,
  ...props
}) => /* @__PURE__ */ (0, import_jsx_runtime32.jsx)(
  "div",
  {
    className: cn(
      "flex flex-col space-y-2 text-center sm:text-left",
      className
    ),
    ...props
  }
);
SheetHeader.displayName = "SheetHeader";
var SheetFooter = ({
  className,
  ...props
}) => /* @__PURE__ */ (0, import_jsx_runtime32.jsx)(
  "div",
  {
    className: cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    ),
    ...props
  }
);
SheetFooter.displayName = "SheetFooter";
var SheetTitle = React21.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime32.jsx)(
  SheetPrimitive.Title,
  {
    ref,
    className: cn("text-lg font-semibold text-foreground", className),
    ...props
  }
));
SheetTitle.displayName = SheetPrimitive.Title.displayName;
var SheetDescription = React21.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime32.jsx)(
  SheetPrimitive.Description,
  {
    ref,
    className: cn("text-sm text-muted-foreground", className),
    ...props
  }
));
SheetDescription.displayName = SheetPrimitive.Description.displayName;

// src/components/ui/skeleton.tsx
var import_jsx_runtime33 = require("react/jsx-runtime");
function Skeleton({
  className,
  ...props
}) {
  return /* @__PURE__ */ (0, import_jsx_runtime33.jsx)(
    "div",
    {
      className: cn("animate-pulse rounded-md bg-muted", className),
      ...props
    }
  );
}

// src/components/ui/tooltip.tsx
var React22 = __toESM(require("react"), 1);
var TooltipPrimitive = __toESM(require("@radix-ui/react-tooltip"), 1);
var import_jsx_runtime34 = require("react/jsx-runtime");
var TooltipProvider = TooltipPrimitive.Provider;
var Tooltip = TooltipPrimitive.Root;
var TooltipTrigger = TooltipPrimitive.Trigger;
var TooltipContent = React22.forwardRef(({ className, sideOffset = 4, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime34.jsx)(
  TooltipPrimitive.Content,
  {
    ref,
    sideOffset,
    className: cn(
      "z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-xs text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
      className
    ),
    ...props
  }
));
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

// src/components/ui/sidebar.tsx
var import_jsx_runtime35 = require("react/jsx-runtime");
var SIDEBAR_COOKIE_NAME = "sidebar:state";
var SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
var SIDEBAR_WIDTH = "16rem";
var SIDEBAR_WIDTH_MOBILE = "18rem";
var SIDEBAR_WIDTH_ICON = "3rem";
var SIDEBAR_KEYBOARD_SHORTCUT = "b";
var SidebarContext = React23.createContext(null);
function useSidebar() {
  const context = React23.useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.");
  }
  return context;
}
var SidebarProvider = React23.forwardRef(({ defaultOpen = true, open: openProp, onOpenChange: setOpenProp, className, style, children, ...props }, ref) => {
  const [_open, _setOpen] = React23.useState(defaultOpen);
  const open = openProp ?? _open;
  const setOpen = React23.useCallback(
    (value) => {
      const openState = typeof value === "function" ? value(open) : value;
      if (setOpenProp) {
        setOpenProp(openState);
      } else {
        _setOpen(openState);
      }
      document.cookie = `${SIDEBAR_COOKIE_NAME}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`;
    },
    [setOpenProp, open]
  );
  const [openMobile, setOpenMobile] = React23.useState(false);
  const [isMobile, setIsMobile] = React23.useState(false);
  React23.useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth < 768 && open) {
        setOpen(false);
      }
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, [setOpen, open]);
  React23.useEffect(() => {
    const savedState = localStorage.getItem(SIDEBAR_COOKIE_NAME);
    if (savedState !== null) {
      setOpen(savedState === "true");
    }
  }, [setOpen]);
  React23.useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === SIDEBAR_KEYBOARD_SHORTCUT && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen(!open);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, setOpen]);
  const toggleSidebar = React23.useCallback(() => {
    return isMobile ? setOpenMobile((open2) => !open2) : setOpen((open2) => !open2);
  }, [isMobile, setOpen, setOpenMobile]);
  const state = open ? "expanded" : "collapsed";
  const contextValue = React23.useMemo(
    () => ({
      state,
      open,
      setOpen,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar
    }),
    [state, open, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar]
  );
  const providerStyle = React23.useMemo(() => {
    const vars = {
      ...style,
      "--sidebar-width": SIDEBAR_WIDTH,
      "--sidebar-width-icon": SIDEBAR_WIDTH_ICON
    };
    return vars;
  }, [style]);
  return /* @__PURE__ */ (0, import_jsx_runtime35.jsx)(SidebarContext.Provider, { value: contextValue, children: /* @__PURE__ */ (0, import_jsx_runtime35.jsx)(TooltipProvider, { delayDuration: 0, children: /* @__PURE__ */ (0, import_jsx_runtime35.jsx)(
    "div",
    {
      style: providerStyle,
      className: cn(
        "group/sidebar-wrapper flex min-h-svh w-full has-[[data-variant=inset]]:bg-sidebar",
        className
      ),
      ref,
      ...props,
      children
    }
  ) }) });
});
SidebarProvider.displayName = "SidebarProvider";
var Sidebar = React23.forwardRef(({ side = "left", variant = "sidebar", collapsible = "offcanvas", className, children, ...props }, ref) => {
  const { isMobile, state, openMobile, setOpenMobile } = useSidebar();
  if (collapsible === "none") {
    return /* @__PURE__ */ (0, import_jsx_runtime35.jsx)(
      "div",
      {
        className: cn(
          "flex h-full w-[--sidebar-width] flex-col bg-sidebar text-sidebar-foreground",
          className
        ),
        ref,
        ...props,
        children
      }
    );
  }
  const sheetStyles = {
    "--sidebar-width": SIDEBAR_WIDTH_MOBILE
  };
  if (isMobile) {
    return /* @__PURE__ */ (0, import_jsx_runtime35.jsx)(Sheet, { open: openMobile, onOpenChange: setOpenMobile, ...props, children: /* @__PURE__ */ (0, import_jsx_runtime35.jsx)(
      SheetContent,
      {
        "data-sidebar": "sidebar",
        "data-mobile": "true",
        className: "w-[--sidebar-width-mobile] bg-sidebar p-0 text-sidebar-foreground [&>button]:hidden",
        style: sheetStyles,
        side,
        children: /* @__PURE__ */ (0, import_jsx_runtime35.jsx)("div", { className: "flex h-full w-full flex-col", children })
      }
    ) });
  }
  return /* @__PURE__ */ (0, import_jsx_runtime35.jsxs)(
    "div",
    {
      ref,
      className: "group peer hidden md:block text-sidebar-foreground",
      "data-state": state,
      "data-collapsible": state === "collapsed" ? collapsible : "",
      "data-variant": variant,
      "data-side": side,
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime35.jsx)(
          "div",
          {
            className: cn(
              "duration-200 relative h-svh w-[--sidebar-width] bg-transparent transition-[width] ease-linear",
              "group-data-[collapsible=offcanvas]:w-0",
              "group-data-[side=right]:rotate-180",
              variant === "floating" || variant === "inset" ? "group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)_+_theme(spacing.4))]" : "group-data-[collapsible=icon]:w-[--sidebar-width-icon]"
            )
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime35.jsx)(
          "div",
          {
            className: cn(
              "duration-200 fixed inset-y-0 z-10 hidden h-svh w-[--sidebar-width] transition-[left,right,width] ease-linear md:flex",
              side === "left" ? "left-0 group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]" : "right-0 group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)]",
              // Adjust the padding for floating and inset variants.
              variant === "floating" || variant === "inset" ? "p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)_+_theme(spacing.4)_+2px)]" : "group-data-[collapsible=icon]:w-[--sidebar-width-icon] group-data-[side=left]:border-r group-data-[side=right]:border-l",
              className
            ),
            ...props,
            children: /* @__PURE__ */ (0, import_jsx_runtime35.jsx)(
              "div",
              {
                "data-sidebar": "sidebar",
                className: "flex h-full w-full flex-col bg-sidebar group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:border group-data-[variant=floating]:border-sidebar-border group-data-[variant=floating]:shadow",
                children
              }
            )
          }
        )
      ]
    }
  );
});
Sidebar.displayName = "Sidebar";
var SidebarTrigger = React23.forwardRef(({ className, onClick, ...props }, ref) => {
  const { toggleSidebar } = useSidebar();
  return /* @__PURE__ */ (0, import_jsx_runtime35.jsxs)(
    Button,
    {
      ref,
      "data-sidebar": "trigger",
      variant: "ghost",
      size: "icon",
      className: cn("h-7 w-7", className),
      onClick: (event) => {
        onClick?.(event);
        toggleSidebar();
      },
      ...props,
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime35.jsx)(import_lucide_react16.PanelLeft, {}),
        /* @__PURE__ */ (0, import_jsx_runtime35.jsx)("span", { className: "sr-only", children: "Toggle Sidebar" })
      ]
    }
  );
});
SidebarTrigger.displayName = "SidebarTrigger";
var SidebarRail = React23.forwardRef(({ className, ...props }, ref) => {
  const { toggleSidebar } = useSidebar();
  return /* @__PURE__ */ (0, import_jsx_runtime35.jsx)(
    "button",
    {
      ref,
      "data-sidebar": "rail",
      "aria-label": "Toggle Sidebar",
      tabIndex: -1,
      onClick: toggleSidebar,
      title: "Toggle Sidebar",
      className: cn(
        "absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-linear after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] after:-translate-x-1/2 after:bg-sidebar-border hover:after:bg-sidebar-accent-foreground group-data-[side=left]:-right-4 group-data-[side=right]:left-0 sm:flex",
        "[[data-side=left]_&]:cursor-w-resize [[data-side=right]_&]:cursor-e-resize",
        "[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize",
        "group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:left-full group-data-[collapsible=offcanvas]:hover:bg-sidebar",
        "[[data-side=left][data-collapsible=offcanvas]_&]:-right-2",
        "[[data-side=right][data-collapsible=offcanvas]_&]:-left-2",
        className
      ),
      ...props
    }
  );
});
SidebarRail.displayName = "SidebarRail";
var SidebarInset = React23.forwardRef(({ className, ...props }, ref) => {
  return /* @__PURE__ */ (0, import_jsx_runtime35.jsx)(
    "main",
    {
      ref,
      className: cn(
        "relative flex min-h-svh flex-1 flex-col bg-background",
        "peer-data-[variant=inset]:min-h-[calc(100svh-theme(spacing.4))] md:peer-data-[variant=inset]:m-2 md:peer-data-[state=collapsed]:peer-data-[variant=inset]:ml-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow",
        className
      ),
      ...props
    }
  );
});
SidebarInset.displayName = "SidebarInset";
var SidebarHeader = React23.forwardRef(({ className, ...props }, ref) => {
  return /* @__PURE__ */ (0, import_jsx_runtime35.jsx)(
    "div",
    {
      ref,
      "data-sidebar": "header",
      className: cn("flex flex-col gap-2 p-2", className),
      ...props
    }
  );
});
SidebarHeader.displayName = "SidebarHeader";
var SidebarFooter = React23.forwardRef(({ className, ...props }, ref) => {
  return /* @__PURE__ */ (0, import_jsx_runtime35.jsx)(
    "div",
    {
      ref,
      "data-sidebar": "footer",
      className: cn("flex flex-col gap-2 p-2", className),
      ...props
    }
  );
});
SidebarFooter.displayName = "SidebarFooter";
var SidebarSeparator = React23.forwardRef(({ className, ...props }, ref) => {
  return /* @__PURE__ */ (0, import_jsx_runtime35.jsx)(
    Separator2,
    {
      ref,
      "data-sidebar": "separator",
      className: cn("mx-2 w-auto bg-sidebar-border", className),
      ...props
    }
  );
});
SidebarSeparator.displayName = "SidebarSeparator";
var SidebarContent = React23.forwardRef(({ className, ...props }, ref) => {
  return /* @__PURE__ */ (0, import_jsx_runtime35.jsx)(
    "div",
    {
      ref,
      "data-sidebar": "content",
      className: cn(
        "flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]:overflow-hidden",
        className
      ),
      ...props
    }
  );
});
SidebarContent.displayName = "SidebarContent";
var SidebarGroup = React23.forwardRef(({ className, ...props }, ref) => {
  return /* @__PURE__ */ (0, import_jsx_runtime35.jsx)(
    "div",
    {
      ref,
      "data-sidebar": "group",
      className: cn("relative flex w-full min-w-0 flex-col p-2", className),
      ...props
    }
  );
});
SidebarGroup.displayName = "SidebarGroup";
var SidebarGroupLabel = React23.forwardRef(({ className, asChild = false, ...props }, ref) => {
  const Comp = asChild ? import_react_slot.Slot : "div";
  return /* @__PURE__ */ (0, import_jsx_runtime35.jsx)(
    Comp,
    {
      ref,
      "data-sidebar": "group-label",
      className: cn(
        "duration-200 flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 outline-none ring-sidebar-ring transition-[margin,opa] ease-linear focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        "group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0",
        className
      ),
      ...props
    }
  );
});
SidebarGroupLabel.displayName = "SidebarGroupLabel";
var SidebarGroupAction = React23.forwardRef(({ className, asChild = false, ...props }, ref) => {
  const Comp = asChild ? import_react_slot.Slot : "button";
  return /* @__PURE__ */ (0, import_jsx_runtime35.jsx)(
    Comp,
    {
      ref,
      "data-sidebar": "group-action",
      className: cn(
        "absolute right-3 top-3.5 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground outline-none ring-sidebar-ring transition-transform hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
        // Increases the hit area of the button on mobile.
        "after:absolute after:-inset-2 after:md:hidden",
        "group-data-[collapsible=icon]:hidden",
        className
      ),
      ...props
    }
  );
});
SidebarGroupAction.displayName = "SidebarGroupAction";
var SidebarGroupContent = React23.forwardRef(({ className, ...props }, ref) => {
  return /* @__PURE__ */ (0, import_jsx_runtime35.jsx)(
    "div",
    {
      ref,
      "data-sidebar": "group-content",
      className: cn("w-full text-sm", className),
      ...props
    }
  );
});
SidebarGroupContent.displayName = "SidebarGroupContent";
var SidebarMenu = React23.forwardRef(({ className, ...props }, ref) => {
  return /* @__PURE__ */ (0, import_jsx_runtime35.jsx)(
    "ul",
    {
      ref,
      "data-sidebar": "menu",
      className: cn("flex w-full min-w-0 flex-col gap-1", className),
      ...props
    }
  );
});
SidebarMenu.displayName = "SidebarMenu";
var SidebarMenuItem = React23.forwardRef(({ className, ...props }, ref) => {
  return /* @__PURE__ */ (0, import_jsx_runtime35.jsx)(
    "li",
    {
      ref,
      "data-sidebar": "menu-item",
      className: cn("group/menu-item relative", className),
      ...props
    }
  );
});
SidebarMenuItem.displayName = "SidebarMenuItem";
var sidebarMenuButtonVariants = (0, import_class_variance_authority2.cva)(
  "peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-none ring-sidebar-ring transition-[width,height,padding] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-[[data-sidebar=menu-action]]/menu-item:pr-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:!size-8 group-data-[collapsible=icon]:!p-2 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        outline: "bg-background shadow-[0_0_0_1px_hsl(var(--sidebar-border))] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-[0_0_0_1px_hsl(var(--sidebar-accent))]"
      },
      size: {
        default: "h-8 text-sm",
        sm: "h-7 text-xs",
        lg: "h-12 text-sm group-data-[collapsible=icon]:!size-8"
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default"
    }
  }
);
var SidebarMenuButton = React23.forwardRef(({ asChild = false, isActive = false, variant = "default", size = "default", tooltip, className, ...props }, ref) => {
  const Comp = asChild ? import_react_slot.Slot : "button";
  const { isMobile, state } = useSidebar();
  const button = /* @__PURE__ */ (0, import_jsx_runtime35.jsx)(
    Comp,
    {
      ref,
      "data-sidebar": "menu-button",
      "data-size": size,
      "data-active": isActive,
      className: cn(sidebarMenuButtonVariants({ variant, size }), className),
      ...props
    }
  );
  if (!tooltip) {
    return button;
  }
  if (typeof tooltip === "string") {
    tooltip = {
      children: tooltip
    };
  }
  return /* @__PURE__ */ (0, import_jsx_runtime35.jsxs)(Tooltip, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime35.jsx)(TooltipTrigger, { asChild: true, children: button }),
    /* @__PURE__ */ (0, import_jsx_runtime35.jsx)(
      TooltipContent,
      {
        side: "right",
        align: "center",
        hidden: state !== "collapsed" || isMobile,
        ...tooltip
      }
    )
  ] });
});
SidebarMenuButton.displayName = "SidebarMenuButton";
var SidebarMenuAction = React23.forwardRef(({ className, asChild = false, showOnHover = false, ...props }, ref) => {
  const Comp = asChild ? import_react_slot.Slot : "button";
  return /* @__PURE__ */ (0, import_jsx_runtime35.jsx)(
    Comp,
    {
      ref,
      "data-sidebar": "menu-action",
      className: cn(
        "absolute right-1 top-1.5 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground outline-none ring-sidebar-ring transition-transform hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 peer-hover/menu-button:text-sidebar-accent-foreground [&>svg]:size-4 [&>svg]:shrink-0",
        // Increases the hit area of the button on mobile.
        "after:absolute after:-inset-2 after:md:hidden",
        "peer-data-[size=sm]/menu-button:top-1",
        "peer-data-[size=default]/menu-button:top-1.5",
        "peer-data-[size=lg]/menu-button:top-2.5",
        "group-data-[collapsible=icon]:hidden",
        showOnHover && "group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 data-[state=open]:opacity-100 peer-data-[active=true]/menu-button:text-sidebar-accent-foreground md:opacity-0",
        className
      ),
      ...props
    }
  );
});
SidebarMenuAction.displayName = "SidebarMenuAction";
var SidebarMenuBadge = React23.forwardRef(({ className, ...props }, ref) => {
  return /* @__PURE__ */ (0, import_jsx_runtime35.jsx)(
    "div",
    {
      ref,
      "data-sidebar": "menu-badge",
      className: cn(
        "absolute right-1 flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-medium tabular-nums text-sidebar-foreground select-none pointer-events-none",
        "peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[active=true]/menu-button:text-sidebar-accent-foreground",
        "peer-data-[size=sm]/menu-button:top-1",
        "peer-data-[size=default]/menu-button:top-1.5",
        "peer-data-[size=lg]/menu-button:top-2.5",
        "group-data-[collapsible=icon]:hidden",
        className
      ),
      ...props
    }
  );
});
SidebarMenuBadge.displayName = "SidebarMenuBadge";
var SidebarMenuSkeleton = React23.forwardRef(({ className, showIcon = false, ...props }, ref) => {
  const width = React23.useMemo(() => {
    return `${Math.floor(Math.random() * 40) + 50}%`;
  }, []);
  const skeletonStyle = { "--skeleton-width": width };
  return /* @__PURE__ */ (0, import_jsx_runtime35.jsxs)(
    "div",
    {
      ref,
      "data-sidebar": "menu-skeleton",
      className: cn("rounded-md h-8 flex gap-2 px-2 items-center", className),
      ...props,
      children: [
        showIcon && /* @__PURE__ */ (0, import_jsx_runtime35.jsx)(Skeleton, { className: "size-4 rounded-md", "data-sidebar": "menu-skeleton-icon" }),
        /* @__PURE__ */ (0, import_jsx_runtime35.jsx)(
          Skeleton,
          {
            className: "h-4 flex-1 max-w-[--skeleton-width]",
            "data-sidebar": "menu-skeleton-text",
            style: skeletonStyle
          }
        )
      ]
    }
  );
});
SidebarMenuSkeleton.displayName = "SidebarMenuSkeleton";
var SidebarMenuSub = React23.forwardRef(({ className, ...props }, ref) => {
  return /* @__PURE__ */ (0, import_jsx_runtime35.jsx)(
    "ul",
    {
      ref,
      "data-sidebar": "menu-sub",
      className: cn(
        "mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l border-sidebar-border px-2.5 py-0.5",
        "group-data-[collapsible=icon]:hidden",
        className
      ),
      ...props
    }
  );
});
SidebarMenuSub.displayName = "SidebarMenuSub";
var SidebarMenuSubItem = React23.forwardRef(({ ...props }, ref) => {
  return /* @__PURE__ */ (0, import_jsx_runtime35.jsx)("li", { ref, ...props });
});
SidebarMenuSubItem.displayName = "SidebarMenuSubItem";
var SidebarMenuSubButton = React23.forwardRef(({ asChild = false, size = "md", isActive, className, ...props }, ref) => {
  const Comp = asChild ? import_react_slot.Slot : "a";
  return /* @__PURE__ */ (0, import_jsx_runtime35.jsx)(
    Comp,
    {
      ref,
      "data-sidebar": "menu-sub-button",
      "data-size": size,
      "data-active": isActive,
      className: cn(
        "flex h-7 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground outline-none ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-sidebar-foreground/50",
        "data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground",
        size === "sm" && "text-xs",
        size === "md" && "text-sm",
        "group-data-[collapsible=icon]:hidden",
        className
      ),
      ...props
    }
  );
});
SidebarMenuSubButton.displayName = "SidebarMenuSubButton";

// src/components/ui/input.tsx
var React24 = __toESM(require("react"), 1);
var import_jsx_runtime36 = require("react/jsx-runtime");
var Input = React24.forwardRef(
  ({ className, type, ...props }, ref) => {
    return /* @__PURE__ */ (0, import_jsx_runtime36.jsx)(
      "input",
      {
        type,
        className: cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        ),
        ref,
        ...props
      }
    );
  }
);
Input.displayName = "Input";

// src/components/ui/card.tsx
var React25 = __toESM(require("react"), 1);
var import_jsx_runtime37 = require("react/jsx-runtime");
var Card = React25.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime37.jsx)(
  "div",
  {
    ref,
    className: cn(
      "rounded-lg border bg-card text-card-foreground shadow-sm",
      className
    ),
    ...props
  }
));
Card.displayName = "Card";
var CardHeader = React25.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime37.jsx)(
  "div",
  {
    ref,
    className: cn("flex flex-col space-y-1.5 p-6", className),
    ...props
  }
));
CardHeader.displayName = "CardHeader";
var CardTitle = React25.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime37.jsx)(
  "h3",
  {
    ref,
    className: cn(
      "text-2xl font-semibold leading-none tracking-tight",
      className
    ),
    ...props
  }
));
CardTitle.displayName = "CardTitle";
var CardDescription = React25.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime37.jsx)(
  "p",
  {
    ref,
    className: cn("text-sm text-muted-foreground", className),
    ...props
  }
));
CardDescription.displayName = "CardDescription";
var CardContent = React25.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime37.jsx)("div", { ref, className: cn("p-6 pt-0", className), ...props }));
CardContent.displayName = "CardContent";
var CardFooter = React25.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime37.jsx)(
  "div",
  {
    ref,
    className: cn("flex items-center p-6 pt-0", className),
    ...props
  }
));
CardFooter.displayName = "CardFooter";

// src/components/ui/badge.tsx
var import_class_variance_authority3 = require("class-variance-authority");
var import_jsx_runtime38 = require("react/jsx-runtime");
var badgeVariants = (0, import_class_variance_authority3.cva)(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);
function Badge({ className, variant, ...props }) {
  return /* @__PURE__ */ (0, import_jsx_runtime38.jsx)("div", { className: cn(badgeVariants({ variant }), className), ...props });
}

// src/components/ui/dialog.tsx
var React26 = __toESM(require("react"), 1);
var import_jsx_runtime39 = require("react/jsx-runtime");
var Dialog = React26.createContext({});
var DialogRoot = ({ open, onOpenChange, children }) => {
  return /* @__PURE__ */ (0, import_jsx_runtime39.jsx)(Dialog.Provider, { value: { open, onOpenChange }, children });
};
var DialogTrigger = React26.forwardRef(({ className, children, ...props }, ref) => {
  const context = React26.useContext(Dialog);
  return /* @__PURE__ */ (0, import_jsx_runtime39.jsx)(
    "button",
    {
      ref,
      className: cn(className),
      onClick: () => context.onOpenChange?.(true),
      ...props,
      children
    }
  );
});
DialogTrigger.displayName = "DialogTrigger";
var DialogContent = React26.forwardRef(({ className, children, ...props }, ref) => {
  const context = React26.useContext(Dialog);
  if (!context.open) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime39.jsx)("div", { className: "fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm", children: /* @__PURE__ */ (0, import_jsx_runtime39.jsxs)(
    "div",
    {
      ref,
      className: cn(
        "relative z-50 grid w-full max-w-lg gap-4 border bg-background p-6 shadow-lg duration-200 sm:rounded-lg",
        className
      ),
      ...props,
      children: [
        children,
        /* @__PURE__ */ (0, import_jsx_runtime39.jsx)(
          "button",
          {
            className: "absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
            onClick: () => context.onOpenChange?.(false),
            children: /* @__PURE__ */ (0, import_jsx_runtime39.jsxs)(
              "svg",
              {
                width: "24",
                height: "24",
                viewBox: "0 0 24 24",
                fill: "none",
                stroke: "currentColor",
                strokeWidth: "2",
                strokeLinecap: "round",
                strokeLinejoin: "round",
                className: "h-4 w-4",
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime39.jsx)("path", { d: "m18 6-12 12" }),
                  /* @__PURE__ */ (0, import_jsx_runtime39.jsx)("path", { d: "m6 6 12 12" })
                ]
              }
            )
          }
        )
      ]
    }
  ) });
});
DialogContent.displayName = "DialogContent";
var DialogHeader = React26.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime39.jsx)(
  "div",
  {
    ref,
    className: cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className
    ),
    ...props
  }
));
DialogHeader.displayName = "DialogHeader";
var DialogTitle = React26.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime39.jsx)(
  "h3",
  {
    ref,
    className: cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    ),
    ...props
  }
));
DialogTitle.displayName = "DialogTitle";

// src/components/ui/textarea.tsx
var React27 = __toESM(require("react"), 1);
var import_jsx_runtime40 = require("react/jsx-runtime");
var Textarea = React27.forwardRef(
  ({ className, ...props }, ref) => {
    return /* @__PURE__ */ (0, import_jsx_runtime40.jsx)(
      "textarea",
      {
        className: cn(
          "flex min-h-[80px] w-full rounded-md border-none bg-transparent px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 resize-none",
          className
        ),
        ref,
        ...props
      }
    );
  }
);
Textarea.displayName = "Textarea";

// src/components/ui/dropdown-menu.tsx
var React28 = __toESM(require("react"), 1);
var DropdownMenuPrimitive = __toESM(require("@radix-ui/react-dropdown-menu"), 1);
var import_lucide_react17 = require("lucide-react");
var import_jsx_runtime41 = require("react/jsx-runtime");
var DropdownMenu = DropdownMenuPrimitive.Root;
var DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
var DropdownMenuGroup = DropdownMenuPrimitive.Group;
var DropdownMenuPortal = DropdownMenuPrimitive.Portal;
var DropdownMenuSub = DropdownMenuPrimitive.Sub;
var DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;
var DropdownMenuSubTrigger = React28.forwardRef(({ className, inset, children, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime41.jsxs)(
  DropdownMenuPrimitive.SubTrigger,
  {
    ref,
    className: cn(
      "flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent data-[state=open]:bg-accent [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
      inset && "pl-8",
      className
    ),
    ...props,
    children: [
      children,
      /* @__PURE__ */ (0, import_jsx_runtime41.jsx)(import_lucide_react17.ChevronRight, { className: "ml-auto" })
    ]
  }
));
DropdownMenuSubTrigger.displayName = DropdownMenuPrimitive.SubTrigger.displayName;
var DropdownMenuSubContent = React28.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime41.jsx)(
  DropdownMenuPrimitive.SubContent,
  {
    ref,
    className: cn(
      "z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[--radix-dropdown-menu-content-transform-origin]",
      className
    ),
    ...props
  }
));
DropdownMenuSubContent.displayName = DropdownMenuPrimitive.SubContent.displayName;
var DropdownMenuContent = React28.forwardRef(({ className, sideOffset = 4, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime41.jsx)(DropdownMenuPrimitive.Portal, { children: /* @__PURE__ */ (0, import_jsx_runtime41.jsx)(
  DropdownMenuPrimitive.Content,
  {
    ref,
    sideOffset,
    className: cn(
      "z-50 max-h-[var(--radix-dropdown-menu-content-available-height)] min-w-[8rem] overflow-y-auto overflow-x-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md",
      "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 origin-[--radix-dropdown-menu-content-transform-origin]",
      className
    ),
    ...props
  }
) }));
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName;
var DropdownMenuItem = React28.forwardRef(({ className, inset, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime41.jsx)(
  DropdownMenuPrimitive.Item,
  {
    ref,
    className: cn(
      "relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&>svg]:size-4 [&>svg]:shrink-0",
      inset && "pl-8",
      className
    ),
    ...props
  }
));
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName;
var DropdownMenuCheckboxItem = React28.forwardRef(({ className, children, checked, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime41.jsxs)(
  DropdownMenuPrimitive.CheckboxItem,
  {
    ref,
    className: cn(
      "relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    ),
    checked,
    ...props,
    children: [
      /* @__PURE__ */ (0, import_jsx_runtime41.jsx)("span", { className: "absolute left-2 flex h-3.5 w-3.5 items-center justify-center", children: /* @__PURE__ */ (0, import_jsx_runtime41.jsx)(DropdownMenuPrimitive.ItemIndicator, { children: /* @__PURE__ */ (0, import_jsx_runtime41.jsx)(import_lucide_react17.Check, { className: "h-4 w-4" }) }) }),
      children
    ]
  }
));
DropdownMenuCheckboxItem.displayName = DropdownMenuPrimitive.CheckboxItem.displayName;
var DropdownMenuRadioItem = React28.forwardRef(({ className, children, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime41.jsxs)(
  DropdownMenuPrimitive.RadioItem,
  {
    ref,
    className: cn(
      "relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className
    ),
    ...props,
    children: [
      /* @__PURE__ */ (0, import_jsx_runtime41.jsx)("span", { className: "absolute left-2 flex h-3.5 w-3.5 items-center justify-center", children: /* @__PURE__ */ (0, import_jsx_runtime41.jsx)(DropdownMenuPrimitive.ItemIndicator, { children: /* @__PURE__ */ (0, import_jsx_runtime41.jsx)(import_lucide_react17.Circle, { className: "h-2 w-2 fill-current" }) }) }),
      children
    ]
  }
));
DropdownMenuRadioItem.displayName = DropdownMenuPrimitive.RadioItem.displayName;
var DropdownMenuLabel = React28.forwardRef(({ className, inset, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime41.jsx)(
  DropdownMenuPrimitive.Label,
  {
    ref,
    className: cn(
      "px-2 py-1.5 text-sm font-semibold",
      inset && "pl-8",
      className
    ),
    ...props
  }
));
DropdownMenuLabel.displayName = DropdownMenuPrimitive.Label.displayName;
var DropdownMenuSeparator = React28.forwardRef(({ className, ...props }, ref) => /* @__PURE__ */ (0, import_jsx_runtime41.jsx)(
  DropdownMenuPrimitive.Separator,
  {
    ref,
    className: cn("-mx-1 my-1 h-px bg-muted", className),
    ...props
  }
));
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName;
var DropdownMenuShortcut = ({
  className,
  ...props
}) => {
  return /* @__PURE__ */ (0, import_jsx_runtime41.jsx)(
    "span",
    {
      className: cn("ml-auto text-xs tracking-widest opacity-60", className),
      ...props
    }
  );
};
DropdownMenuShortcut.displayName = "DropdownMenuShortcut";

// src/components/AppSidebar.tsx
var import_jsx_runtime42 = require("react/jsx-runtime");
var ThreadItem = ({
  thread,
  isActive,
  onClick,
  onDelete,
  onRename
}) => {
  const [isEditing, setIsEditing] = (0, import_react27.useState)(false);
  const [editTitle, setEditTitle] = (0, import_react27.useState)(thread.title || "New Chat");
  const [showMenu, setShowMenu] = (0, import_react27.useState)(false);
  const handleRename = (0, import_react27.useCallback)(() => {
    if (editTitle.trim() && editTitle !== thread.title) {
      onRename(editTitle.trim());
    }
    setIsEditing(false);
  }, [editTitle, thread.title, onRename]);
  const handleKeyPress = (0, import_react27.useCallback)((e) => {
    if (e.key === "Enter") {
      handleRename();
    } else if (e.key === "Escape") {
      setEditTitle(thread.title || "New Chat");
      setIsEditing(false);
    }
  }, [handleRename, thread.title]);
  return /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)(SidebarMenuItem, { className: "mb-3", children: [
    /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(SidebarMenuButton, { asChild: true, isActive, children: /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("div", { onClick, children: isEditing ? /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(
      Input,
      {
        value: editTitle,
        onChange: (e) => setEditTitle(e.target.value),
        onBlur: handleRename,
        onKeyPress: handleKeyPress,
        className: "flex-1 text-sm bg-transparent border-none outline-none",
        autoFocus: true,
        onClick: (e) => e.stopPropagation()
      }
    ) : /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("div", { className: "flex-1", children: [
      /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("p", { className: "text-sm font-medium truncate leading-tight", children: thread.title || "New Chat" }),
      /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("p", { className: "text-xs text-muted-foreground truncate leading-tight mt-0.5", children: thread.last_message || "No messages yet" })
    ] }) }) }),
    !isEditing && /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)(DropdownMenu, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(DropdownMenuTrigger, { asChild: true, children: /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(SidebarMenuAction, { onClick: (e) => {
        e.stopPropagation();
        setShowMenu(!showMenu);
      }, children: /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(import_lucide_react18.MoreHorizontal, {}) }) }),
      /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)(DropdownMenuContent, { className: "w-[--radix-popper-anchor-width]", children: [
        /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)(
          DropdownMenuItem,
          {
            onClick: (e) => {
              e.stopPropagation();
              setIsEditing(true);
              setShowMenu(false);
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(import_lucide_react18.Edit3, { className: "h-3 w-3" }),
              /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("span", { children: "Rename" })
            ]
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)(
          DropdownMenuItem,
          {
            onClick: (e) => {
              e.stopPropagation();
              onDelete();
              setShowMenu(false);
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(import_lucide_react18.Trash2, { className: "h-3 w-3" }),
              /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("span", { children: "Delete" })
            ]
          }
        )
      ] })
    ] })
  ] });
};
function AppSidebar({
  selectedThreadId,
  currentPage,
  onNewChat,
  onThreadSelect,
  onThreadDelete,
  onThreadRename,
  onLogoClick,
  onPageChange
}) {
  const { threads, loading: threadsLoading, refetch } = useThreads();
  const { theme, setTheme } = useTheme();
  const { open } = useSidebar();
  const handleRefresh = (0, import_react27.useCallback)(() => {
    refetch();
  }, [refetch]);
  return /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)(Sidebar, { collapsible: "icon", variant: "floating", children: [
    /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(SidebarHeader, { children: /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(SidebarMenu, { children: /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)(SidebarMenuItem, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)(
        SidebarMenuButton,
        {
          onClick: onLogoClick,
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(import_lucide_react18.Bot, {}),
            "Distri"
          ]
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)(
        SidebarMenuAction,
        {
          onClick: () => setTheme(theme === "light" ? "dark" : "light"),
          title: "Toggle theme",
          className: "absolute right-0 top-0",
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)("svg", { className: "h-4 w-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: [
              /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("circle", { cx: "12", cy: "12", r: "5" }),
              /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("path", { d: "M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("svg", { className: "absolute h-4 w-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0", fill: "none", viewBox: "0 0 24 24", stroke: "currentColor", children: /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("path", { d: "M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" }) })
          ]
        }
      )
    ] }) }) }),
    /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(SidebarSeparator, {}),
    /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)(SidebarContent, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)(SidebarGroup, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(SidebarGroupLabel, { children: "Actions" }),
        /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(SidebarGroupContent, { children: /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)(SidebarMenu, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(SidebarMenuItem, { className: "mb-1", children: /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)(
            SidebarMenuButton,
            {
              isActive: currentPage === "chat",
              onClick: () => {
                onPageChange("chat");
                onNewChat();
              },
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(import_lucide_react18.Edit2, { className: "h-4 w-4" }),
                "New Chat"
              ]
            }
          ) }),
          /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(SidebarMenuItem, { className: "mb-1", children: /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)(
            SidebarMenuButton,
            {
              isActive: currentPage === "agents",
              onClick: () => onPageChange("agents"),
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(import_lucide_react18.Users, { className: "h-4 w-4" }),
                "Agents"
              ]
            }
          ) })
        ] }) })
      ] }),
      open && /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)(SidebarGroup, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(SidebarGroupLabel, { children: "Conversations" }),
        /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(SidebarGroupContent, { children: /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(SidebarMenu, { children: threadsLoading ? /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)(SidebarMenuItem, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(import_lucide_react18.Loader2, { className: "h-4 w-4 animate-spin" }),
          /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("span", { children: "Loading threads..." })
        ] }) : threads.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(SidebarMenuItem, { children: "No conversations yet" }) : threads.map((thread) => /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(
          ThreadItem,
          {
            thread,
            isActive: thread.id === selectedThreadId,
            onClick: () => onThreadSelect(thread.id),
            onDelete: () => onThreadDelete(thread.id),
            onRename: (newTitle) => onThreadRename(thread.id, newTitle)
          },
          thread.id
        )) }) }),
        /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)(
          SidebarGroupAction,
          {
            onClick: handleRefresh,
            disabled: threadsLoading,
            title: "Refresh conversations",
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(import_lucide_react18.RefreshCw, { className: `${threadsLoading ? "animate-spin" : ""}` }),
              /* @__PURE__ */ (0, import_jsx_runtime42.jsx)("span", { className: "sr-only", children: "Refresh conversations" })
            ]
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(SidebarFooter, { children: /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(SidebarMenu, { children: /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(SidebarMenuItem, { children: /* @__PURE__ */ (0, import_jsx_runtime42.jsxs)(
      SidebarMenuButton,
      {
        onClick: () => window.open("https://github.com/your-repo/distri", "_blank"),
        title: "GitHub",
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime42.jsx)(import_lucide_react18.Github, {}),
          "Distri"
        ]
      }
    ) }) }) })
  ] });
}

// src/components/BrowserPreviewPanel.tsx
var import_jsx_runtime43 = require("react/jsx-runtime");
var BrowserPreviewPanel = ({
  frameSrc,
  timestampLabel,
  className
}) => {
  return /* @__PURE__ */ (0, import_jsx_runtime43.jsxs)(
    "div",
    {
      className: cn(
        "rounded-xl border bg-muted/40 shadow-sm overflow-hidden",
        className
      ),
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime43.jsxs)("div", { className: "flex items-center justify-between px-3 py-2 border-b bg-background/70 backdrop-blur text-xs text-muted-foreground", children: [
          /* @__PURE__ */ (0, import_jsx_runtime43.jsx)("span", { className: "text-xs sm:text-sm font-medium text-foreground", children: "Live browser preview" }),
          timestampLabel && /* @__PURE__ */ (0, import_jsx_runtime43.jsxs)("span", { className: "text-[11px] text-muted-foreground/80", children: [
            "Updated ",
            timestampLabel
          ] })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime43.jsx)("div", { className: "bg-background", children: /* @__PURE__ */ (0, import_jsx_runtime43.jsx)(
          "img",
          {
            src: frameSrc,
            alt: "Browser screenshot",
            className: "block w-full h-auto object-contain"
          }
        ) })
      ]
    }
  );
};

// src/components/BrowserViewport.tsx
var import_jsx_runtime44 = require("react/jsx-runtime");
var DefaultEmptyState = () => /* @__PURE__ */ (0, import_jsx_runtime44.jsxs)("div", { className: "flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground", children: [
  /* @__PURE__ */ (0, import_jsx_runtime44.jsx)("p", { children: "No browser session." }),
  /* @__PURE__ */ (0, import_jsx_runtime44.jsx)("p", { className: "text-xs text-muted-foreground/70", children: "Browser will appear here when an agent uses it." })
] });
var BrowserViewport = ({
  className,
  emptyState,
  viewerUrl: viewerUrlOverride
}) => {
  const browserViewerUrl = useChatStateStore((state) => state.browserViewerUrl);
  const browserSessionId = useChatStateStore((state) => state.browserSessionId);
  const effectiveViewerUrl = viewerUrlOverride || browserViewerUrl;
  if (effectiveViewerUrl) {
    return /* @__PURE__ */ (0, import_jsx_runtime44.jsxs)(
      "div",
      {
        className: cn(
          "relative h-full min-h-[400px] w-full overflow-hidden rounded-xl border border-border/40 bg-background",
          className
        ),
        children: [
          browserSessionId && /* @__PURE__ */ (0, import_jsx_runtime44.jsxs)("div", { className: "absolute left-2 top-2 z-10 rounded-md bg-background/90 px-2 py-1 text-xs text-muted-foreground backdrop-blur-sm", children: [
            "Session: ",
            browserSessionId
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime44.jsx)(
            "iframe",
            {
              src: effectiveViewerUrl,
              className: "h-full w-full border-0",
              title: "Browser Viewer",
              sandbox: "allow-scripts allow-same-origin allow-forms"
            }
          )
        ]
      }
    );
  }
  return /* @__PURE__ */ (0, import_jsx_runtime44.jsx)(
    "div",
    {
      className: cn(
        "h-full min-h-[220px] rounded-xl border border-dashed border-border/40 bg-muted/10 p-4",
        className
      ),
      children: emptyState ?? /* @__PURE__ */ (0, import_jsx_runtime44.jsx)(DefaultEmptyState, {})
    }
  );
};

// src/components/ConfigurationPanel.tsx
var import_react29 = require("react");

// src/hooks/useConfiguration.ts
var import_react28 = require("react");
function useConfiguration() {
  const { client, isLoading } = useDistri();
  const [configuration, setConfiguration] = (0, import_react28.useState)(null);
  const [meta, setMeta] = (0, import_react28.useState)(null);
  const [loading, setLoading] = (0, import_react28.useState)(true);
  const [error, setError] = (0, import_react28.useState)(null);
  const refresh = (0, import_react28.useCallback)(async () => {
    setLoading(true);
    try {
      if (isLoading || !client) return;
      const response = await client.getConfiguration();
      setConfiguration(response.configuration);
      setMeta(response.meta);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load configuration";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [client, isLoading]);
  const saveConfiguration = (0, import_react28.useCallback)(
    async (config) => {
      setLoading(true);
      try {
        const response = await client.updateConfiguration(config);
        setConfiguration(response.configuration);
        setMeta(response.meta);
        setError(null);
        return response;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to update configuration";
        setError(message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [client]
  );
  (0, import_react28.useEffect)(() => {
    void refresh();
  }, [refresh]);
  return {
    configuration,
    meta,
    loading,
    error,
    refresh,
    saveConfiguration,
    setConfiguration
  };
}

// src/components/ConfigurationPanel.tsx
var import_jsx_runtime45 = require("react/jsx-runtime");
var providerOptions = [
  { value: "openai", label: "OpenAI", hint: "Hosted" },
  { value: "openai_compat", label: "OpenAI Compatible", hint: "Custom base URL" },
  { value: "vllora", label: "VLLora", hint: "Local" }
];
var defaultModelSettings = (settings) => {
  const provider = parseProvider(settings?.provider);
  return {
    model: settings?.model || "gpt-4.1-mini",
    temperature: settings?.temperature ?? 0.7,
    max_tokens: settings?.max_tokens ?? 1e3,
    context_size: settings?.context_size ?? 2e4,
    top_p: settings?.top_p ?? 1,
    frequency_penalty: settings?.frequency_penalty ?? 0,
    presence_penalty: settings?.presence_penalty ?? 0,
    provider,
    parameters: settings?.parameters,
    response_format: settings?.response_format
  };
};
var parseProvider = (provider) => {
  if (!provider) return { name: "openai" };
  if (typeof provider === "string") {
    return { name: provider };
  }
  if (!provider.name) {
    return { ...provider, name: "openai" };
  }
  return provider;
};
var providerDefaults = (name) => {
  switch (name) {
    case "openai_compat":
      return { name, base_url: "http://localhost:8080/v1" };
    case "vllora":
      return { name, base_url: "http://localhost:9090/v1" };
    default:
      return { name };
  }
};
var FieldLabel = ({ children }) => /* @__PURE__ */ (0, import_jsx_runtime45.jsx)("span", { className: "text-xs font-medium text-muted-foreground", children });
var MetaRow = ({ meta }) => {
  if (!meta) return null;
  return /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)("div", { className: "flex flex-wrap items-center gap-2 text-xs text-muted-foreground", children: [
    /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(Badge, { variant: meta.overrides_active ? "secondary" : "outline", children: meta.overrides_active ? "Overrides active" : "Using base configuration" }),
    /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)("span", { className: "truncate", children: [
      "Base: ",
      meta.base_path
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)("span", { className: "truncate", children: [
      "Overrides: ",
      meta.overrides_path
    ] })
  ] });
};
function ConfigurationPanel({ className, title = "Agent Settings" }) {
  const { configuration, meta, loading, error } = useConfiguration();
  const [draft, setDraft] = (0, import_react29.useState)(null);
  const [useCustomAnalysis, setUseCustomAnalysis] = (0, import_react29.useState)(false);
  (0, import_react29.useEffect)(() => {
    if (configuration) {
      setDraft({
        ...configuration,
        model_settings: defaultModelSettings(configuration.model_settings),
        analysis_model_settings: configuration.analysis_model_settings ? defaultModelSettings(configuration.analysis_model_settings) : void 0
      });
      setUseCustomAnalysis(Boolean(configuration.analysis_model_settings));
    }
  }, [configuration]);
  const providerName = (0, import_react29.useMemo)(() => {
    if (!draft?.model_settings) return "openai";
    const provider = draft.model_settings.provider;
    return provider?.name || "openai";
  }, [draft]);
  const analysisProviderName = (0, import_react29.useMemo)(() => {
    if (!draft?.analysis_model_settings) return providerName;
    return draft.analysis_model_settings.provider?.name || providerName;
  }, [draft, providerName]);
  const updateModelSetting = (target, key, value) => {
    setDraft((current) => {
      if (!current) return current;
      const next = { ...current };
      const currentSettings = target === "model_settings" ? current.model_settings : current.analysis_model_settings;
      const merged = defaultModelSettings(currentSettings || current.model_settings);
      next[target] = { ...merged, [key]: value };
      return next;
    });
  };
  const updateProvider = (target, name) => {
    setDraft((current) => {
      if (!current) return current;
      const next = { ...current };
      const currentSettings = target === "model_settings" ? current.model_settings : current.analysis_model_settings;
      const merged = defaultModelSettings(currentSettings || current.model_settings);
      const nextProvider = providerDefaults(name);
      next[target] = { ...merged, provider: nextProvider };
      return next;
    });
  };
  const renderProviderExtras = (settings, fallbackName) => {
    const provider = parseProvider(settings?.provider);
    const activeName = provider.name || fallbackName;
    if (!activeName || activeName !== "openai_compat" && activeName !== "vllora") {
      return null;
    }
    return /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)("div", { className: "space-y-2 rounded-md border border-dashed border-border/60 p-3", children: [
      /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)("div", { className: "flex items-center justify-between", children: [
        /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(FieldLabel, { children: "Provider details" }),
        /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(Badge, { variant: "outline", className: "uppercase", children: activeName })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(
        Input,
        {
          value: provider.base_url || "",
          onChange: (e) => updateModelSetting(
            settings === draft?.analysis_model_settings ? "analysis_model_settings" : "model_settings",
            "provider",
            { ...provider, base_url: e.target.value }
          ),
          placeholder: "https://your-provider/v1"
        }
      ),
      activeName === "openai_compat" && /* @__PURE__ */ (0, import_jsx_runtime45.jsx)("p", { className: "text-xs text-muted-foreground", children: "Base URL for your compatible gateway. Credentials are pulled from the backend environment when available." })
    ] });
  };
  const disabled = true;
  return /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)("div", { className: cn("space-y-4", className), children: [
    /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)("div", { className: "flex items-start justify-between gap-3", children: [
      /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)("div", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime45.jsx)("p", { className: "text-xs uppercase tracking-[0.3em] text-muted-foreground", children: "Distri" }),
        /* @__PURE__ */ (0, import_jsx_runtime45.jsx)("h2", { className: "text-xl font-semibold", children: title })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime45.jsx)("div", { className: "flex items-center gap-2", children: meta && /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(MetaRow, { meta }) })
    ] }),
    error && /* @__PURE__ */ (0, import_jsx_runtime45.jsx)("div", { className: "rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive", children: error }),
    !draft && loading && /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(Card, { children: /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)(CardContent, { className: "space-y-3 p-4", children: [
      /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(Skeleton, { className: "h-6 w-1/3" }),
      /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(Skeleton, { className: "h-4 w-full" }),
      /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(Skeleton, { className: "h-4 w-2/3" })
    ] }) }),
    draft && /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)(import_jsx_runtime45.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(Card, { children: /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)(CardContent, { className: "grid gap-4 md:grid-cols-2", children: [
        /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)("div", { className: "space-y-2", children: [
          /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(FieldLabel, { children: "Name" }),
          /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(
            Input,
            {
              value: draft.name,
              onChange: (e) => setDraft((curr) => curr ? { ...curr, name: e.target.value } : curr),
              placeholder: "browsr",
              disabled
            }
          )
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)("div", { className: "space-y-2", children: [
          /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(FieldLabel, { children: "Version" }),
          /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(
            Input,
            {
              value: draft.version,
              onChange: (e) => setDraft((curr) => curr ? { ...curr, version: e.target.value } : curr),
              placeholder: "0.1.0",
              disabled
            }
          )
        ] })
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)(Card, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)(CardHeader, { children: [
          /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(CardTitle, { children: "Default model" }),
          /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(CardDescription, { children: "Used for most agent calls unless a definition overrides it." })
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)(CardContent, { className: "grid gap-4 md:grid-cols-2", children: [
          /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)("div", { className: "space-y-2", children: [
            /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(FieldLabel, { children: "Provider" }),
            /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)(
              Select,
              {
                value: providerName,
                onValueChange: (value) => updateProvider("model_settings", value),
                disabled,
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(SelectValue, { placeholder: "Choose provider" }) }),
                  /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(SelectContent, { children: providerOptions.map((option) => /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(SelectItem, { value: option.value, children: /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)("div", { className: "flex items-center justify-between gap-2", children: [
                    /* @__PURE__ */ (0, import_jsx_runtime45.jsx)("span", { children: option.label }),
                    option.hint && /* @__PURE__ */ (0, import_jsx_runtime45.jsx)("span", { className: "text-xs text-muted-foreground", children: option.hint })
                  ] }) }, option.value)) })
                ]
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)("div", { className: "space-y-2", children: [
            /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(FieldLabel, { children: "Model ID" }),
            /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(
              Input,
              {
                value: draft.model_settings?.model || "",
                onChange: (e) => updateModelSetting("model_settings", "model", e.target.value),
                placeholder: "gpt-4.1-mini",
                disabled
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)("div", { className: "space-y-2", children: [
            /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(FieldLabel, { children: "Temperature" }),
            /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(
              Input,
              {
                type: "number",
                step: "0.1",
                min: "0",
                max: "2",
                value: draft.model_settings?.temperature ?? 0,
                onChange: (e) => updateModelSetting("model_settings", "temperature", Number.parseFloat(e.target.value)),
                disabled
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)("div", { className: "space-y-2", children: [
            /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(FieldLabel, { children: "Max tokens" }),
            /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(
              Input,
              {
                type: "number",
                min: "1",
                value: draft.model_settings?.max_tokens ?? 0,
                onChange: (e) => updateModelSetting("model_settings", "max_tokens", Number(e.target.value)),
                disabled
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)("div", { className: "space-y-2", children: [
            /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(FieldLabel, { children: "Context size" }),
            /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(
              Input,
              {
                type: "number",
                min: "1024",
                step: "512",
                value: draft.model_settings?.context_size ?? 0,
                onChange: (e) => updateModelSetting("model_settings", "context_size", Number(e.target.value)),
                disabled
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)("div", { className: "space-y-2", children: [
            /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(FieldLabel, { children: "Top P" }),
            /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(
              Input,
              {
                type: "number",
                min: "0",
                max: "1",
                step: "0.05",
                value: draft.model_settings?.top_p ?? 1,
                onChange: (e) => updateModelSetting("model_settings", "top_p", Number.parseFloat(e.target.value)),
                disabled
              }
            )
          ] }),
          renderProviderExtras(draft.model_settings)
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)(Card, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)(CardHeader, { className: "flex flex-row items-center justify-between gap-3", children: [
          /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)("div", { children: [
            /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(CardTitle, { children: "Analysis model" }),
            /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(CardDescription, { children: "Optional lighter model for planning and summaries." })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(
              Checkbox,
              {
                id: "analysis-toggle",
                checked: useCustomAnalysis,
                onCheckedChange: (checked) => {
                  const active = Boolean(checked);
                  setUseCustomAnalysis(active);
                  if (!active) {
                    setDraft((current) => current ? { ...current, analysis_model_settings: void 0 } : current);
                  } else {
                    setDraft(
                      (current) => current ? {
                        ...current,
                        analysis_model_settings: defaultModelSettings(
                          current.analysis_model_settings || current.model_settings
                        )
                      } : current
                    );
                  }
                },
                disabled: loading
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime45.jsx)("label", { htmlFor: "analysis-toggle", className: "text-sm text-muted-foreground", children: "Use dedicated analysis settings" })
          ] })
        ] }),
        useCustomAnalysis && /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)(CardContent, { className: "grid gap-4 md:grid-cols-2", children: [
          /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)("div", { className: "space-y-2", children: [
            /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(FieldLabel, { children: "Provider" }),
            /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)(
              Select,
              {
                value: analysisProviderName,
                onValueChange: (value) => updateProvider("analysis_model_settings", value),
                disabled,
                children: [
                  /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(SelectTrigger, { children: /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(SelectValue, { placeholder: "Choose provider" }) }),
                  /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(SelectContent, { children: providerOptions.map((option) => /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(SelectItem, { value: option.value, children: /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)("div", { className: "flex items-center justify-between gap-2", children: [
                    /* @__PURE__ */ (0, import_jsx_runtime45.jsx)("span", { children: option.label }),
                    option.hint && /* @__PURE__ */ (0, import_jsx_runtime45.jsx)("span", { className: "text-xs text-muted-foreground", children: option.hint })
                  ] }) }, option.value)) })
                ]
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)("div", { className: "space-y-2", children: [
            /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(FieldLabel, { children: "Model ID" }),
            /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(
              Input,
              {
                value: draft.analysis_model_settings?.model || "",
                onChange: (e) => updateModelSetting("analysis_model_settings", "model", e.target.value),
                placeholder: "gpt-4.1-mini",
                disabled
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)("div", { className: "space-y-2", children: [
            /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(FieldLabel, { children: "Temperature" }),
            /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(
              Input,
              {
                type: "number",
                step: "0.1",
                min: "0",
                max: "2",
                value: draft.analysis_model_settings?.temperature ?? 0,
                onChange: (e) => updateModelSetting("analysis_model_settings", "temperature", Number.parseFloat(e.target.value)),
                disabled
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)("div", { className: "space-y-2", children: [
            /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(FieldLabel, { children: "Max tokens" }),
            /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(
              Input,
              {
                type: "number",
                min: "1",
                value: draft.analysis_model_settings?.max_tokens ?? 0,
                onChange: (e) => updateModelSetting("analysis_model_settings", "max_tokens", Number(e.target.value)),
                disabled
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)("div", { className: "space-y-2", children: [
            /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(FieldLabel, { children: "Context size" }),
            /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(
              Input,
              {
                type: "number",
                min: "1024",
                step: "512",
                value: draft.analysis_model_settings?.context_size ?? 0,
                onChange: (e) => updateModelSetting("analysis_model_settings", "context_size", Number(e.target.value)),
                disabled
              }
            )
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime45.jsxs)("div", { className: "space-y-2", children: [
            /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(FieldLabel, { children: "Top P" }),
            /* @__PURE__ */ (0, import_jsx_runtime45.jsx)(
              Input,
              {
                type: "number",
                min: "0",
                max: "1",
                step: "0.05",
                value: draft.analysis_model_settings?.top_p ?? 1,
                onChange: (e) => updateModelSetting("analysis_model_settings", "top_p", Number.parseFloat(e.target.value)),
                disabled
              }
            )
          ] }),
          renderProviderExtras(draft.analysis_model_settings, analysisProviderName)
        ] })
      ] })
    ] })
  ] });
}

// src/components/ThemeToggle.tsx
var import_react30 = __toESM(require("react"), 1);
var import_lucide_react19 = require("lucide-react");
var import_jsx_runtime46 = require("react/jsx-runtime");
function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const dropdownRef = import_react30.default.useRef(null);
  return /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("div", { className: "relative", ref: dropdownRef, children: /* @__PURE__ */ (0, import_jsx_runtime46.jsxs)(
    "button",
    {
      onClick: () => setTheme(theme === "light" ? "dark" : "light"),
      className: "flex items-center justify-center w-9 h-9 rounded-md border bg-background hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors",
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime46.jsx)(import_lucide_react19.Sun, { className: "h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" }),
        /* @__PURE__ */ (0, import_jsx_runtime46.jsx)(import_lucide_react19.Moon, { className: "absolute h-[1.2rem] w-[1.2rem] scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" }),
        /* @__PURE__ */ (0, import_jsx_runtime46.jsx)("span", { className: "sr-only", children: "Toggle theme" })
      ]
    }
  ) });
}

// src/components/Toast.tsx
var import_react31 = require("react");
var import_lucide_react20 = require("lucide-react");
var import_jsx_runtime47 = require("react/jsx-runtime");

// src/components/AskFollowUp.tsx
var import_react32 = require("react");
var import_jsx_runtime48 = require("react/jsx-runtime");
var ASK_FOLLOW_UP_TOOL_NAME = "ask_follow_up";
function createAskFollowUpTool() {
  return {
    type: "ui",
    name: ASK_FOLLOW_UP_TOOL_NAME,
    description: "Ask the user a series of follow-up questions to gather more information. Questions are shown one at a time in a stepper format.",
    isExternal: false,
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Optional title for the question series"
        },
        description: {
          type: "string",
          description: "Optional description explaining why these questions are being asked"
        },
        questions: {
          type: "array",
          description: "Array of questions to ask",
          items: {
            type: "object",
            properties: {
              id: {
                type: "string",
                description: "Unique identifier for the question (used as key in answers)"
              },
              question: {
                type: "string",
                description: "The question text to display"
              },
              type: {
                type: "string",
                enum: ["text", "select", "multiselect", "boolean"],
                description: "Type of input: text for free-form, select for single choice, multiselect for multiple choices, boolean for yes/no"
              },
              options: {
                type: "array",
                items: { type: "string" },
                description: "Options for select/multiselect types"
              },
              placeholder: {
                type: "string",
                description: "Placeholder text for text inputs"
              },
              required: {
                type: "boolean",
                description: "Whether this question must be answered"
              },
              default: {
                description: "Default value for the question"
              }
            },
            required: ["id", "question", "type"]
          }
        }
      },
      required: ["questions"]
    },
    component: AskFollowUpComponent
  };
}
function AskFollowUpComponent({
  toolCall,
  toolCallState,
  completeTool
}) {
  const input = toolCall.input;
  const questions = (0, import_react32.useMemo)(() => input?.questions || [], [input?.questions]);
  const hasQuestions = questions.length > 0;
  const [currentStep, setCurrentStep] = (0, import_react32.useState)(0);
  const [answers, setAnswers] = (0, import_react32.useState)(() => {
    const defaults = {};
    questions.forEach((q) => {
      if (q.default !== void 0) {
        defaults[q.id] = q.default;
      } else if (q.type === "multiselect") {
        defaults[q.id] = [];
      } else if (q.type === "boolean") {
        defaults[q.id] = false;
      } else {
        defaults[q.id] = "";
      }
    });
    return defaults;
  });
  const [otherSelected, setOtherSelected] = (0, import_react32.useState)({});
  const [otherText, setOtherText] = (0, import_react32.useState)({});
  const currentQuestion = hasQuestions ? questions[currentStep] : null;
  const isLastStep = currentStep === questions.length - 1;
  const isCompleted = toolCallState?.status === "completed";
  (0, import_react32.useEffect)(() => {
    if (!hasQuestions && !isCompleted) {
      const output = { answers: {}, completed: true };
      completeTool({
        tool_call_id: toolCall.tool_call_id,
        tool_name: toolCall.tool_name,
        parts: [{
          part_type: "data",
          data: output
        }]
      });
    }
  }, [hasQuestions, isCompleted, completeTool, toolCall.tool_call_id, toolCall.tool_name]);
  const handleAnswer = (0, import_react32.useCallback)((value) => {
    if (!currentQuestion) return;
    setAnswers((prev) => ({
      ...prev,
      [currentQuestion.id]: value
    }));
  }, [currentQuestion]);
  const handleNext = (0, import_react32.useCallback)(() => {
    if (!currentQuestion) return;
    if (currentQuestion.required && !answers[currentQuestion.id]) {
      return;
    }
    if (isLastStep) {
      const output = {
        answers,
        completed: true
      };
      completeTool({
        tool_call_id: toolCall.tool_call_id,
        tool_name: toolCall.tool_name,
        parts: [{
          part_type: "data",
          data: output
        }]
      });
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  }, [currentQuestion, answers, isLastStep, completeTool, toolCall]);
  const handleBack = (0, import_react32.useCallback)(() => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  }, [currentStep]);
  const handleKeyDown = (0, import_react32.useCallback)((e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleNext();
    }
  }, [handleNext]);
  const handleSkip = (0, import_react32.useCallback)(() => {
    const output = {
      answers,
      completed: true
    };
    completeTool({
      tool_call_id: toolCall.tool_call_id,
      tool_name: toolCall.tool_name,
      parts: [{
        part_type: "data",
        data: output
      }]
    });
  }, [answers, completeTool, toolCall]);
  if (!hasQuestions) {
    return null;
  }
  if (isCompleted) {
    return /* @__PURE__ */ (0, import_jsx_runtime48.jsxs)("div", { className: "border rounded-lg p-4 bg-muted/30", children: [
      /* @__PURE__ */ (0, import_jsx_runtime48.jsxs)("div", { className: "flex items-center gap-2 text-sm text-muted-foreground", children: [
        /* @__PURE__ */ (0, import_jsx_runtime48.jsx)(CheckIcon, { className: "w-4 h-4 text-green-500" }),
        /* @__PURE__ */ (0, import_jsx_runtime48.jsx)("span", { children: "Follow-up questions answered" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime48.jsx)("div", { className: "mt-2 space-y-1", children: questions.map((q) => /* @__PURE__ */ (0, import_jsx_runtime48.jsxs)("div", { className: "text-xs", children: [
        /* @__PURE__ */ (0, import_jsx_runtime48.jsx)("span", { className: "text-muted-foreground", children: q.question }),
        /* @__PURE__ */ (0, import_jsx_runtime48.jsx)("span", { className: "ml-2 font-medium", children: Array.isArray(answers[q.id]) ? answers[q.id].join(", ") : String(answers[q.id]) })
      ] }, q.id)) })
    ] });
  }
  if (!currentQuestion) {
    return null;
  }
  return /* @__PURE__ */ (0, import_jsx_runtime48.jsxs)("div", { className: "border rounded-lg overflow-hidden bg-background shadow-sm", children: [
    (input.title || input.description) && /* @__PURE__ */ (0, import_jsx_runtime48.jsxs)("div", { className: "px-4 py-3 border-b bg-muted/30", children: [
      input.title && /* @__PURE__ */ (0, import_jsx_runtime48.jsx)("h3", { className: "font-medium text-sm", children: input.title }),
      input.description && /* @__PURE__ */ (0, import_jsx_runtime48.jsx)("p", { className: "text-xs text-muted-foreground mt-1", children: input.description })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime48.jsxs)("div", { className: "px-4 pt-3", children: [
      /* @__PURE__ */ (0, import_jsx_runtime48.jsx)("div", { className: "flex items-center gap-1", children: questions.map((_, idx) => /* @__PURE__ */ (0, import_jsx_runtime48.jsx)(
        "div",
        {
          className: cn(
            "h-1 flex-1 rounded-full transition-colors",
            idx < currentStep ? "bg-primary" : idx === currentStep ? "bg-primary/50" : "bg-muted"
          )
        },
        idx
      )) }),
      /* @__PURE__ */ (0, import_jsx_runtime48.jsxs)("p", { className: "text-xs text-muted-foreground mt-2", children: [
        "Question ",
        currentStep + 1,
        " of ",
        questions.length
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime48.jsxs)("div", { className: "p-4", children: [
      /* @__PURE__ */ (0, import_jsx_runtime48.jsxs)("label", { className: "block text-sm font-medium mb-3", children: [
        currentQuestion.question,
        currentQuestion.required && /* @__PURE__ */ (0, import_jsx_runtime48.jsx)("span", { className: "text-destructive ml-1", children: "*" })
      ] }),
      currentQuestion.type === "text" && /* @__PURE__ */ (0, import_jsx_runtime48.jsx)(
        "input",
        {
          type: "text",
          value: answers[currentQuestion.id] || "",
          onChange: (e) => handleAnswer(e.target.value),
          onKeyDown: handleKeyDown,
          placeholder: currentQuestion.placeholder || "Type your answer...",
          className: "w-full px-3 py-2 text-sm border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50",
          autoFocus: true
        }
      ),
      currentQuestion.type === "select" && currentQuestion.options && /* @__PURE__ */ (0, import_jsx_runtime48.jsxs)("div", { className: "space-y-2", children: [
        currentQuestion.options.map((option) => /* @__PURE__ */ (0, import_jsx_runtime48.jsx)(
          "button",
          {
            onClick: () => {
              setOtherSelected((prev) => ({ ...prev, [currentQuestion.id]: false }));
              handleAnswer(option);
            },
            className: cn(
              "w-full px-3 py-2 text-sm text-left border rounded-md transition-colors",
              answers[currentQuestion.id] === option && !otherSelected[currentQuestion.id] ? "border-primary bg-primary/10" : "hover:bg-muted"
            ),
            children: option
          },
          option
        )),
        /* @__PURE__ */ (0, import_jsx_runtime48.jsx)(
          "button",
          {
            onClick: () => {
              setOtherSelected((prev) => ({ ...prev, [currentQuestion.id]: true }));
              handleAnswer(otherText[currentQuestion.id] || "");
            },
            className: cn(
              "w-full px-3 py-2 text-sm text-left border rounded-md transition-colors",
              otherSelected[currentQuestion.id] ? "border-primary bg-primary/10" : "hover:bg-muted"
            ),
            children: "Other (type your own)"
          }
        ),
        otherSelected[currentQuestion.id] && /* @__PURE__ */ (0, import_jsx_runtime48.jsx)(
          "input",
          {
            type: "text",
            value: otherText[currentQuestion.id] || "",
            onChange: (e) => {
              setOtherText((prev) => ({ ...prev, [currentQuestion.id]: e.target.value }));
              handleAnswer(e.target.value);
            },
            onKeyDown: handleKeyDown,
            placeholder: currentQuestion.placeholder || "Type your custom answer...",
            className: "w-full px-3 py-2 text-sm border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50",
            autoFocus: true
          }
        )
      ] }),
      currentQuestion.type === "multiselect" && currentQuestion.options && /* @__PURE__ */ (0, import_jsx_runtime48.jsxs)("div", { className: "space-y-2", children: [
        currentQuestion.options.map((option) => {
          const selected = (answers[currentQuestion.id] || []).includes(option);
          return /* @__PURE__ */ (0, import_jsx_runtime48.jsxs)(
            "button",
            {
              onClick: () => {
                const current = answers[currentQuestion.id] || [];
                const newValue = selected ? current.filter((v) => v !== option) : [...current, option];
                handleAnswer(newValue);
              },
              className: cn(
                "w-full px-3 py-2 text-sm text-left border rounded-md transition-colors flex items-center gap-2",
                selected ? "border-primary bg-primary/10" : "hover:bg-muted"
              ),
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime48.jsx)("div", { className: cn(
                  "w-4 h-4 border rounded flex items-center justify-center",
                  selected ? "bg-primary border-primary" : "border-muted-foreground"
                ), children: selected && /* @__PURE__ */ (0, import_jsx_runtime48.jsx)(CheckIcon, { className: "w-3 h-3 text-primary-foreground" }) }),
                option
              ]
            },
            option
          );
        }),
        /* @__PURE__ */ (0, import_jsx_runtime48.jsxs)(
          "button",
          {
            onClick: () => {
              setOtherSelected((prev) => ({ ...prev, [currentQuestion.id]: !prev[currentQuestion.id] }));
            },
            className: cn(
              "w-full px-3 py-2 text-sm text-left border rounded-md transition-colors flex items-center gap-2",
              otherSelected[currentQuestion.id] ? "border-primary bg-primary/10" : "hover:bg-muted"
            ),
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime48.jsx)("div", { className: cn(
                "w-4 h-4 border rounded flex items-center justify-center",
                otherSelected[currentQuestion.id] ? "bg-primary border-primary" : "border-muted-foreground"
              ), children: otherSelected[currentQuestion.id] && /* @__PURE__ */ (0, import_jsx_runtime48.jsx)(CheckIcon, { className: "w-3 h-3 text-primary-foreground" }) }),
              "Other (type your own)"
            ]
          }
        ),
        otherSelected[currentQuestion.id] && /* @__PURE__ */ (0, import_jsx_runtime48.jsx)(
          "input",
          {
            type: "text",
            value: otherText[currentQuestion.id] || "",
            onChange: (e) => {
              const customValue = e.target.value;
              setOtherText((prev) => ({ ...prev, [currentQuestion.id]: customValue }));
              const current = answers[currentQuestion.id] || [];
              const prevCustom = otherText[currentQuestion.id];
              const filtered = current.filter((v) => v !== prevCustom);
              if (customValue) {
                handleAnswer([...filtered, customValue]);
              } else {
                handleAnswer(filtered);
              }
            },
            onKeyDown: handleKeyDown,
            placeholder: currentQuestion.placeholder || "Type your custom answer...",
            className: "w-full px-3 py-2 text-sm border rounded-md bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50",
            autoFocus: true
          }
        )
      ] }),
      currentQuestion.type === "boolean" && /* @__PURE__ */ (0, import_jsx_runtime48.jsxs)("div", { className: "flex gap-3", children: [
        /* @__PURE__ */ (0, import_jsx_runtime48.jsx)(
          "button",
          {
            onClick: () => handleAnswer(true),
            className: cn(
              "flex-1 px-4 py-2 text-sm border rounded-md transition-colors",
              answers[currentQuestion.id] === true ? "border-primary bg-primary/10" : "hover:bg-muted"
            ),
            children: "Yes"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime48.jsx)(
          "button",
          {
            onClick: () => handleAnswer(false),
            className: cn(
              "flex-1 px-4 py-2 text-sm border rounded-md transition-colors",
              answers[currentQuestion.id] === false ? "border-primary bg-primary/10" : "hover:bg-muted"
            ),
            children: "No"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime48.jsxs)("div", { className: "px-4 pb-4 flex items-center justify-between", children: [
      /* @__PURE__ */ (0, import_jsx_runtime48.jsx)(
        "button",
        {
          onClick: handleBack,
          disabled: currentStep === 0,
          className: cn(
            "px-3 py-1.5 text-sm rounded-md transition-colors",
            currentStep === 0 ? "text-muted-foreground cursor-not-allowed" : "hover:bg-muted"
          ),
          children: "Back"
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime48.jsxs)("div", { className: "flex items-center gap-2", children: [
        /* @__PURE__ */ (0, import_jsx_runtime48.jsx)(
          "button",
          {
            onClick: handleSkip,
            className: "px-3 py-1.5 text-sm rounded-md transition-colors text-muted-foreground hover:bg-muted",
            children: "Skip"
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime48.jsx)(
          "button",
          {
            onClick: handleNext,
            disabled: currentQuestion.required && !answers[currentQuestion.id],
            className: cn(
              "px-4 py-1.5 text-sm rounded-md transition-colors",
              currentQuestion.required && !answers[currentQuestion.id] ? "bg-muted text-muted-foreground cursor-not-allowed" : "bg-primary text-primary-foreground hover:bg-primary/90"
            ),
            children: isLastStep ? "Submit" : "Next"
          }
        )
      ] })
    ] })
  ] });
}
function CheckIcon({ className }) {
  return /* @__PURE__ */ (0, import_jsx_runtime48.jsx)(
    "svg",
    {
      className,
      fill: "none",
      stroke: "currentColor",
      viewBox: "0 0 24 24",
      children: /* @__PURE__ */ (0, import_jsx_runtime48.jsx)(
        "path",
        {
          strokeLinecap: "round",
          strokeLinejoin: "round",
          strokeWidth: 2,
          d: "M5 13l4 4L19 7"
        }
      )
    }
  );
}

// src/utils/toolWrapper.ts
var import_react33 = __toESM(require("react"), 1);
function wrapFnToolAsUiTool(fnTool, options = {}) {
  const { autoExecute = false } = options;
  return {
    name: fnTool.name,
    type: "ui",
    description: fnTool.description,
    parameters: fnTool.parameters,
    component: (props) => {
      return import_react33.default.createElement(DefaultToolActions, {
        ...props,
        tool: { ...fnTool, autoExecute: fnTool.autoExecute || autoExecute }
      });
    }
  };
}
function wrapTools(tools, options = {}) {
  return tools.map((tool) => {
    if (tool.type === "function") {
      return wrapFnToolAsUiTool(tool, options);
    }
    return tool;
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ASK_FOLLOW_UP_TOOL_NAME,
  AgentSelect,
  AppSidebar,
  AssistantMessageRenderer,
  AuthLoading,
  Badge,
  BrowserPreviewPanel,
  BrowserViewport,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Chat,
  ChatInner,
  ChatInput,
  ConfigurationPanel,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DistriAuthProvider,
  DistriContext,
  DistriProvider,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  ImageRenderer,
  Input,
  LoadingAnimation,
  LoadingShimmer,
  MessageFeedback,
  MessageReadProvider,
  MessageReadTracker,
  MessageRenderer,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  Separator,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  Skeleton,
  StepBasedRenderer,
  StreamingTextRenderer,
  Textarea,
  ThemeProvider,
  ThemeToggle,
  ThinkingRenderer,
  TodosDisplay,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  TypingIndicator,
  UserMessageRenderer,
  VoiceInput,
  createAskFollowUpTool,
  extractContent,
  useAgent,
  useAgentDefinitions,
  useAgentsByUsage,
  useChat,
  useChatMessages,
  useChatStateStore,
  useConfiguration,
  useDistri,
  useDistriAuth,
  useDistriToken,
  useMessageReadContext,
  useMessageReadStatus,
  useMessageVote,
  useMessageVotes,
  useSidebar,
  useSpeechToText,
  useTheme,
  useThreadReadStatus,
  useThreads,
  useTts,
  useWorkspace,
  wrapFnToolAsUiTool,
  wrapTools
});
