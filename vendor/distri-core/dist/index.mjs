var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// src/types.ts
function isArrayParts(result) {
  return Array.isArray(result) && result[0].part_type;
}
function createSuccessfulToolResult(toolCallId, toolName, result, explicitPartsMetadata) {
  console.log("[createSuccessfulToolResult] toolName:", toolName);
  console.log("[createSuccessfulToolResult] isArrayParts:", isArrayParts(result));
  console.log("[createSuccessfulToolResult] result type:", typeof result, Array.isArray(result) ? `array[${result.length}]` : "");
  if (isArrayParts(result)) {
    console.log("[createSuccessfulToolResult] parts:", result.map((p) => ({ part_type: p.part_type, hasMetadata: !!p.__metadata })));
  }
  const rawParts = isArrayParts(result) ? result : [{
    part_type: "data",
    data: {
      result,
      success: true,
      error: void 0
    }
  }];
  const parts_metadata = { ...explicitPartsMetadata };
  const parts = rawParts.map((part, index) => {
    if ("__metadata" in part && part.__metadata) {
      parts_metadata[index] = { ...parts_metadata[index], ...part.__metadata };
    }
    if (part.part_type === "image" && !parts_metadata[index]) {
      parts_metadata[index] = { save: false };
    }
    const { __metadata, ...cleanPart } = part;
    return cleanPart;
  });
  return {
    tool_call_id: toolCallId,
    tool_name: toolName,
    parts,
    parts_metadata: Object.keys(parts_metadata).length > 0 ? parts_metadata : void 0
  };
}
function createFailedToolResult(toolCallId, toolName, error, result) {
  return {
    tool_call_id: toolCallId,
    tool_name: toolName,
    parts: [{
      part_type: "data",
      data: {
        result: result ?? `Tool execution failed: ${error}`,
        success: false,
        error
      }
    }]
  };
}
function isDataPart(part) {
  return typeof part === "object" && part !== null && "part_type" in part && part.part_type === "data" && "data" in part;
}
function isToolResultData(data) {
  return typeof data === "object" && data !== null && "success" in data && typeof data.success === "boolean";
}
function extractToolResultData(toolResult) {
  if (!toolResult.parts || !Array.isArray(toolResult.parts) || toolResult.parts.length === 0) {
    return null;
  }
  const firstPart = toolResult.parts[0];
  if (isDataPart(firstPart)) {
    const data = firstPart.data;
    if (isToolResultData(data)) {
      return {
        result: data.result,
        success: data.success,
        error: data.error
      };
    }
    if (typeof data === "string") {
      try {
        const parsed = JSON.parse(data);
        if (isToolResultData(parsed)) {
          return {
            result: parsed.result,
            success: parsed.success,
            error: parsed.error
          };
        }
        return {
          result: parsed,
          success: true,
          error: void 0
        };
      } catch {
        return {
          result: data,
          success: true,
          error: void 0
        };
      }
    }
    return {
      result: data,
      success: true,
      error: void 0
    };
  }
  return null;
}
var DEFAULT_BASE_URL = "https://api.distri.dev";
var DistriError = class extends Error {
  constructor(message, code, details) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = "DistriError";
  }
};
var A2AProtocolError = class extends DistriError {
  constructor(message, details) {
    super(message, "A2A_PROTOCOL_ERROR", details);
    this.name = "A2AProtocolError";
  }
};
var ApiError = class extends DistriError {
  constructor(message, statusCode, details) {
    super(message, "API_ERROR", details);
    this.statusCode = statusCode;
    this.name = "ApiError";
  }
};
var ConnectionError = class extends DistriError {
  constructor(message, details) {
    super(message, "CONNECTION_ERROR", details);
    this.name = "ConnectionError";
  }
};
function isDistriMessage(event) {
  return "id" in event && "role" in event && "parts" in event;
}
function isDistriEvent(event) {
  return "type" in event && "data" in event;
}

// ../../node_modules/.pnpm/@a2a-js+sdk@https+++codeload.github.com+v3g42+a2a-js+tar.gz+51444c9/node_modules/@a2a-js/sdk/dist/chunk-CUGIRVQB.js
var A2AClient = class {
  /**
   * Constructs an A2AClient instance.
   * It initiates fetching the agent card from the provided agent baseUrl.
   * The Agent Card is expected at `${agentBaseUrl}/.well-known/agent.json`.
   * The `url` field from the Agent Card will be used as the RPC service endpoint.
   * @param agentBaseUrl The base URL of the A2A agent (e.g., https://agent.example.com).
   */
  constructor(agentBaseUrl, fetchFn) {
    __publicField(this, "agentBaseUrl");
    __publicField(this, "agentCardPromise");
    __publicField(this, "requestIdCounter", 1);
    __publicField(this, "serviceEndpointUrl");
    // To be populated from AgentCard after fetching
    __publicField(this, "fetchFn");
    this.agentBaseUrl = agentBaseUrl.replace(/\/$/, "");
    this.fetchFn = fetchFn || globalThis.fetch;
    this.agentCardPromise = this._fetchAndCacheAgentCard();
  }
  /**
   * Fetches the Agent Card from the agent's well-known URI and caches its service endpoint URL.
   * This method is called by the constructor.
   * @returns A Promise that resolves to the AgentCard.
   */
  async _fetchAndCacheAgentCard() {
    const agentCardUrl = `${this.agentBaseUrl}/.well-known/agent.json`;
    try {
      const response = await this.fetchFn(agentCardUrl, {
        headers: { "Accept": "application/json" }
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch Agent Card from ${agentCardUrl}: ${response.status} ${response.statusText}`);
      }
      const agentCard = await response.json();
      if (!agentCard.url) {
        throw new Error("Fetched Agent Card does not contain a valid 'url' for the service endpoint.");
      }
      this.serviceEndpointUrl = agentCard.url;
      return agentCard;
    } catch (error) {
      console.error("Error fetching or parsing Agent Card:");
      throw error;
    }
  }
  /**
   * Retrieves the Agent Card.
   * If an `agentBaseUrl` is provided, it fetches the card from that specific URL.
   * Otherwise, it returns the card fetched and cached during client construction.
   * @param agentBaseUrl Optional. The base URL of the agent to fetch the card from.
   * If provided, this will fetch a new card, not use the cached one from the constructor's URL.
   * @returns A Promise that resolves to the AgentCard.
   */
  async getAgentCard(agentBaseUrl) {
    if (agentBaseUrl) {
      const specificAgentBaseUrl = agentBaseUrl.replace(/\/$/, "");
      const agentCardUrl = `${specificAgentBaseUrl}/.well-known/agent.json`;
      const response = await this.fetchFn(agentCardUrl, {
        headers: { "Accept": "application/json" }
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch Agent Card from ${agentCardUrl}: ${response.status} ${response.statusText}`);
      }
      return await response.json();
    }
    return this.agentCardPromise;
  }
  /**
   * Gets the RPC service endpoint URL. Ensures the agent card has been fetched first.
   * @returns A Promise that resolves to the service endpoint URL string.
   */
  async _getServiceEndpoint() {
    if (this.serviceEndpointUrl) {
      return this.serviceEndpointUrl;
    }
    await this.agentCardPromise;
    if (!this.serviceEndpointUrl) {
      throw new Error("Agent Card URL for RPC endpoint is not available. Fetching might have failed.");
    }
    return this.serviceEndpointUrl;
  }
  /**
   * Helper method to make a generic JSON-RPC POST request.
   * @param method The RPC method name.
   * @param params The parameters for the RPC method.
   * @returns A Promise that resolves to the RPC response.
   */
  async _postRpcRequest(method, params) {
    const endpoint = await this._getServiceEndpoint();
    const requestId = this.requestIdCounter++;
    const rpcRequest = {
      jsonrpc: "2.0",
      method,
      params,
      // Cast because TParams structure varies per method
      id: requestId
    };
    const httpResponse = await this.fetchFn(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
        // Expect JSON response for non-streaming requests
      },
      body: JSON.stringify(rpcRequest)
    });
    if (!httpResponse.ok) {
      let errorBodyText = "(empty or non-JSON response)";
      try {
        errorBodyText = await httpResponse.text();
        const errorJson = JSON.parse(errorBodyText);
        if (!errorJson.jsonrpc && errorJson.error) {
          throw new Error(`RPC error for ${method}: ${errorJson.error.message} (Code: ${errorJson.error.code}, HTTP Status: ${httpResponse.status}) Data: ${JSON.stringify(errorJson.error.data)}`);
        } else if (!errorJson.jsonrpc) {
          throw new Error(`HTTP error for ${method}! Status: ${httpResponse.status} ${httpResponse.statusText}. Response: ${errorBodyText}`);
        }
      } catch (e) {
        if (e.message.startsWith("RPC error for") || e.message.startsWith("HTTP error for")) throw e;
        throw new Error(`HTTP error for ${method}! Status: ${httpResponse.status} ${httpResponse.statusText}. Response: ${errorBodyText}`);
      }
    }
    const rpcResponse = await httpResponse.json();
    if (rpcResponse.id !== requestId) {
      console.error(`CRITICAL: RPC response ID mismatch for method ${method}. Expected ${requestId}, got ${rpcResponse.id}. This may lead to incorrect response handling.`);
    }
    return rpcResponse;
  }
  /**
   * Sends a message to the agent.
   * The behavior (blocking/non-blocking) and push notification configuration
   * are specified within the `params.configuration` object.
   * Optionally, `params.message.contextId` or `params.message.taskId` can be provided.
   * @param params The parameters for sending the message, including the message content and configuration.
   * @returns A Promise resolving to SendMessageResponse, which can be a Message, Task, or an error.
   */
  async sendMessage(params) {
    return this._postRpcRequest("message/send", params);
  }
  /**
   * Sends a message to the agent and streams back responses using Server-Sent Events (SSE).
   * Push notification configuration can be specified in `params.configuration`.
   * Optionally, `params.message.contextId` or `params.message.taskId` can be provided.
   * Requires the agent to support streaming (`capabilities.streaming: true` in AgentCard).
   * @param params The parameters for sending the message.
   * @returns An AsyncGenerator yielding A2AStreamEventData (Message, Task, TaskStatusUpdateEvent, or TaskArtifactUpdateEvent).
   * The generator throws an error if streaming is not supported or if an HTTP/SSE error occurs.
   */
  async *sendMessageStream(params) {
    const agentCard = await this.agentCardPromise;
    if (!agentCard.capabilities?.streaming) {
      throw new Error("Agent does not support streaming (AgentCard.capabilities.streaming is not true).");
    }
    const endpoint = await this._getServiceEndpoint();
    const clientRequestId = this.requestIdCounter++;
    const rpcRequest = {
      // This is the initial JSON-RPC request to establish the stream
      jsonrpc: "2.0",
      method: "message/stream",
      params,
      id: clientRequestId
    };
    const response = await this.fetchFn(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "text/event-stream"
        // Crucial for SSE
      },
      body: JSON.stringify(rpcRequest)
    });
    if (!response.ok) {
      let errorBody = "";
      try {
        errorBody = await response.text();
        const errorJson = JSON.parse(errorBody);
        if (errorJson.error) {
          throw new Error(`HTTP error establishing stream for message/stream: ${response.status} ${response.statusText}. RPC Error: ${errorJson.error.message} (Code: ${errorJson.error.code})`);
        }
      } catch (e) {
        if (e.message.startsWith("HTTP error establishing stream")) throw e;
        throw new Error(`HTTP error establishing stream for message/stream: ${response.status} ${response.statusText}. Response: ${errorBody || "(empty)"}`);
      }
      throw new Error(`HTTP error establishing stream for message/stream: ${response.status} ${response.statusText}`);
    }
    if (!response.headers.get("Content-Type")?.startsWith("text/event-stream")) {
      throw new Error("Invalid response Content-Type for SSE stream. Expected 'text/event-stream'.");
    }
    yield* this._parseA2ASseStream(response, clientRequestId);
  }
  /**
   * Sets or updates the push notification configuration for a given task.
   * Requires the agent to support push notifications (`capabilities.pushNotifications: true` in AgentCard).
   * @param params Parameters containing the taskId and the TaskPushNotificationConfig.
   * @returns A Promise resolving to SetTaskPushNotificationConfigResponse.
   */
  async setTaskPushNotificationConfig(params) {
    const agentCard = await this.agentCardPromise;
    if (!agentCard.capabilities?.pushNotifications) {
      throw new Error("Agent does not support push notifications (AgentCard.capabilities.pushNotifications is not true).");
    }
    return this._postRpcRequest(
      "tasks/pushNotificationConfig/set",
      params
    );
  }
  /**
   * Gets the push notification configuration for a given task.
   * @param params Parameters containing the taskId.
   * @returns A Promise resolving to GetTaskPushNotificationConfigResponse.
   */
  async getTaskPushNotificationConfig(params) {
    return this._postRpcRequest(
      "tasks/pushNotificationConfig/get",
      params
    );
  }
  /**
   * Retrieves a task by its ID.
   * @param params Parameters containing the taskId and optional historyLength.
   * @returns A Promise resolving to GetTaskResponse, which contains the Task object or an error.
   */
  async getTask(params) {
    return this._postRpcRequest("tasks/get", params);
  }
  /**
   * Cancels a task by its ID.
   * @param params Parameters containing the taskId.
   * @returns A Promise resolving to CancelTaskResponse, which contains the updated Task object or an error.
   */
  async cancelTask(params) {
    return this._postRpcRequest("tasks/cancel", params);
  }
  /**
   * Resubscribes to a task's event stream using Server-Sent Events (SSE).
   * This is used if a previous SSE connection for an active task was broken.
   * Requires the agent to support streaming (`capabilities.streaming: true` in AgentCard).
   * @param params Parameters containing the taskId.
   * @returns An AsyncGenerator yielding A2AStreamEventData (Message, Task, TaskStatusUpdateEvent, or TaskArtifactUpdateEvent).
   */
  async *resubscribeTask(params) {
    const agentCard = await this.agentCardPromise;
    if (!agentCard.capabilities?.streaming) {
      throw new Error("Agent does not support streaming (required for tasks/resubscribe).");
    }
    const endpoint = await this._getServiceEndpoint();
    const clientRequestId = this.requestIdCounter++;
    const rpcRequest = {
      // Initial JSON-RPC request to establish the stream
      jsonrpc: "2.0",
      method: "tasks/resubscribe",
      params,
      id: clientRequestId
    };
    const response = await this.fetchFn(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "text/event-stream"
      },
      body: JSON.stringify(rpcRequest)
    });
    if (!response.ok) {
      let errorBody = "";
      try {
        errorBody = await response.text();
        const errorJson = JSON.parse(errorBody);
        if (errorJson.error) {
          throw new Error(`HTTP error establishing stream for tasks/resubscribe: ${response.status} ${response.statusText}. RPC Error: ${errorJson.error.message} (Code: ${errorJson.error.code})`);
        }
      } catch (e) {
        if (e.message.startsWith("HTTP error establishing stream")) throw e;
        throw new Error(`HTTP error establishing stream for tasks/resubscribe: ${response.status} ${response.statusText}. Response: ${errorBody || "(empty)"}`);
      }
      throw new Error(`HTTP error establishing stream for tasks/resubscribe: ${response.status} ${response.statusText}`);
    }
    if (!response.headers.get("Content-Type")?.startsWith("text/event-stream")) {
      throw new Error("Invalid response Content-Type for SSE stream on resubscribe. Expected 'text/event-stream'.");
    }
    yield* this._parseA2ASseStream(response, clientRequestId);
  }
  /**
   * Parses an HTTP response body as an A2A Server-Sent Event stream.
   * Each 'data' field of an SSE event is expected to be a JSON-RPC 2.0 Response object,
   * specifically a SendStreamingMessageResponse (or similar structure for resubscribe).
   * @param response The HTTP Response object whose body is the SSE stream.
   * @param originalRequestId The ID of the client's JSON-RPC request that initiated this stream.
   * Used to validate the `id` in the streamed JSON-RPC responses.
   * @returns An AsyncGenerator yielding the `result` field of each valid JSON-RPC success response from the stream.
   */
  async *_parseA2ASseStream(response, originalRequestId) {
    if (!response.body) {
      throw new Error("SSE response body is undefined. Cannot read stream.");
    }
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffer = "";
    let eventDataBuffer = "";
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          if (eventDataBuffer.trim()) {
            const result = this._processSseEventData(eventDataBuffer, originalRequestId);
            yield result;
          }
          break;
        }
        buffer += value;
        let lineEndIndex;
        while ((lineEndIndex = buffer.indexOf("\n")) >= 0) {
          const line = buffer.substring(0, lineEndIndex).trim();
          buffer = buffer.substring(lineEndIndex + 1);
          if (line === "") {
            if (eventDataBuffer) {
              const result = this._processSseEventData(eventDataBuffer, originalRequestId);
              yield result;
              eventDataBuffer = "";
            }
          } else if (line.startsWith("data:")) {
            eventDataBuffer += line.substring(5).trimStart() + "\n";
          } else if (line.startsWith(":")) {
          } else if (line.includes(":")) {
          }
        }
      }
    } catch (error) {
      console.error("Error reading or parsing SSE stream:", error.message);
      throw error;
    } finally {
      reader.releaseLock();
    }
  }
  /**
   * Processes a single SSE event's data string, expecting it to be a JSON-RPC response.
   * @param jsonData The string content from one or more 'data:' lines of an SSE event.
   * @param originalRequestId The ID of the client's request that initiated the stream.
   * @returns The `result` field of the parsed JSON-RPC success response.
   * @throws Error if data is not valid JSON, not a valid JSON-RPC response, an error response, or ID mismatch.
   */
  _processSseEventData(jsonData, originalRequestId) {
    if (!jsonData.trim()) {
      throw new Error("Attempted to process empty SSE event data.");
    }
    try {
      const sseJsonRpcResponse = JSON.parse(jsonData.replace(/\n$/, ""));
      const a2aStreamResponse = sseJsonRpcResponse;
      if (a2aStreamResponse.id !== originalRequestId) {
        console.warn(`SSE Event's JSON-RPC response ID mismatch. Client request ID: ${originalRequestId}, event response ID: ${a2aStreamResponse.id}.`);
      }
      if (this.isErrorResponse(a2aStreamResponse)) {
        const err = a2aStreamResponse.error;
        throw new Error(`SSE event contained an error: ${err.message} (Code: ${err.code}) Data: ${JSON.stringify(err.data)}`);
      }
      if (!("result" in a2aStreamResponse) || typeof a2aStreamResponse.result === "undefined") {
        throw new Error(`SSE event JSON-RPC response is missing 'result' field. Data: ${jsonData}`);
      }
      const successResponse = a2aStreamResponse;
      return successResponse.result;
    } catch (e) {
      if (e.message.startsWith("SSE event contained an error") || e.message.startsWith("SSE event JSON-RPC response is missing 'result' field")) {
        throw e;
      }
      console.error("Failed to parse SSE event data string or unexpected JSON-RPC structure:", jsonData, e);
      throw new Error(`Failed to parse SSE event data: "${jsonData.substring(0, 100)}...". Original error: ${e.message}`);
    }
  }
  isErrorResponse(response) {
    return "error" in response;
  }
};

// src/encoder.ts
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
function processA2AStreamData(streamData) {
  const results = [];
  for (const item of streamData) {
    const converted = decodeA2AStreamEvent(item);
    if (converted) {
      results.push(converted);
    }
  }
  return results;
}
function processA2AMessagesData(data) {
  const results = [];
  for (const item of data) {
    if (item.kind === "message") {
      const distriMessage = convertA2AMessageToDistri(item);
      results.push(distriMessage);
    }
  }
  return results;
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
        const fileBytes = { type: "bytes", mime_type: a2aPart.file.mimeType || "application/octet-stream", bytes: a2aPart.file.bytes || "" };
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
function convertDistriMessageToA2A(distriMessage, context) {
  let role;
  switch (distriMessage.role) {
    case "assistant":
      role = "agent";
      break;
    case "user":
      role = "user";
      break;
    case "system":
    case "tool":
    case "developer":
      role = "user";
      break;
    default:
      role = "user";
  }
  return {
    messageId: distriMessage.id,
    role,
    parts: distriMessage.parts.map(convertDistriPartToA2A),
    kind: "message",
    contextId: context.thread_id,
    taskId: context.task_id || context.run_id || void 0,
    metadata: distriMessage.metadata
  };
}
function convertDistriPartToA2A(distriPart) {
  let result;
  switch (distriPart.part_type) {
    case "text":
      result = { kind: "text", text: distriPart.data };
      break;
    case "image":
      if ("url" in distriPart.data) {
        const fileUri = { mimeType: distriPart.data.mime_type, uri: distriPart.data.url };
        result = { kind: "file", file: fileUri };
      } else {
        const fileBytes = { mimeType: distriPart.data.mime_type, bytes: distriPart.data.bytes };
        result = { kind: "file", file: fileBytes };
      }
      break;
    case "tool_call":
      result = {
        kind: "data",
        data: {
          part_type: "tool_call",
          data: distriPart.data
        }
      };
      break;
    case "tool_result": {
      const toolResult = distriPart.data;
      const parts = toolResult.parts.map((part) => {
        if ("type" in part && part.type === "data") {
          return {
            part_type: "data",
            data: part.data
          };
        } else if ("part_type" in part) {
          return part;
        } else {
          return {
            part_type: "data",
            data: part
          };
        }
      });
      result = {
        kind: "data",
        data: {
          part_type: "tool_result",
          data: {
            tool_call_id: toolResult.tool_call_id,
            tool_name: toolResult.tool_name,
            parts
          }
        }
      };
      break;
    }
    case "data": {
      const dataValue = distriPart.data;
      if (dataValue === null || typeof dataValue !== "object" || Array.isArray(dataValue)) {
        result = { kind: "data", data: { value: dataValue } };
      } else {
        const dataObj = dataValue;
        result = { kind: "data", data: dataObj };
      }
      break;
    }
  }
  return result;
}
function extractTextFromDistriMessage(message) {
  return message.parts.filter((part) => part.part_type === "text").map((part) => part.data).join("\n");
}
function extractToolCallsFromDistriMessage(message) {
  return message.parts.filter((part) => part.part_type === "tool_call").map((part) => part.data);
}
function extractToolResultsFromDistriMessage(message) {
  return message.parts.filter((part) => part.part_type === "tool_result").map((part) => part.data);
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

// src/distri-client.ts
var _DistriClient = class _DistriClient {
  constructor(config) {
    this.agentClients = /* @__PURE__ */ new Map();
    const headers = { ...config.headers };
    if (config.workspaceId) {
      headers["X-Workspace-Id"] = config.workspaceId;
    }
    this.accessToken = config.accessToken;
    this.refreshToken = config.refreshToken;
    this.tokenRefreshSkewMs = config.tokenRefreshSkewMs ?? 6e4;
    this.onTokenRefresh = config.onTokenRefresh;
    this.config = {
      baseUrl: config.baseUrl?.replace(/\/$/, "") || DEFAULT_BASE_URL,
      apiVersion: config.apiVersion || "v1",
      timeout: config.timeout ?? 3e4,
      retryAttempts: config.retryAttempts ?? 3,
      retryDelay: config.retryDelay ?? 1e3,
      debug: config.debug ?? false,
      headers,
      interceptor: config.interceptor ?? (async (init) => Promise.resolve(init)),
      onTokenRefresh: config.onTokenRefresh,
      clientId: config.clientId,
      workspaceId: config.workspaceId
    };
  }
  /**
   * Get the configured client ID.
   */
  get clientId() {
    return this.config.clientId;
  }
  /**
   * Set the client ID for embed token issuance.
   */
  set clientId(value) {
    this.config.clientId = value;
  }
  /**
   * Get the configured workspace ID.
   */
  get workspaceId() {
    return this.config.workspaceId;
  }
  /**
   * Set the workspace ID for multi-tenant support.
   * Updates the X-Workspace-Id header for all subsequent requests.
   */
  set workspaceId(value) {
    this.config.workspaceId = value;
    if (value) {
      this.config.headers["X-Workspace-Id"] = value;
    } else {
      delete this.config.headers["X-Workspace-Id"];
    }
  }
  /**
   * Create a client with default cloud configuration.
   *
   * @param overrides - Optional overrides for the default config
   */
  static create(overrides = {}) {
    return new _DistriClient({
      baseUrl: DEFAULT_BASE_URL,
      ...overrides
    });
  }
  /**
   * Check if this client has authentication configured.
   */
  hasAuth() {
    return !!this.accessToken || !!this.refreshToken;
  }
  /**
   * Check if this client is configured for local development.
   */
  isLocal() {
    return this.config.baseUrl.includes("localhost") || this.config.baseUrl.includes("127.0.0.1");
  }
  /**
   * Session store: set a value (optionally with expiry)
   */
  async setSessionValue(sessionId, key, value, expiry) {
    const body = { key, value };
    if (expiry) {
      body.expiry = typeof expiry === "string" ? expiry : expiry.toISOString();
    }
    const resp = await this.fetch(`/sessions/${encodeURIComponent(sessionId)}/values`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.config.headers
      },
      body: JSON.stringify(body)
    });
    if (!resp.ok && resp.status !== 204) {
      const errorData = await resp.json().catch(() => ({}));
      throw new ApiError(errorData.error || "Failed to set session value", resp.status);
    }
  }
  /**
   * Session store: get a single value
   */
  async getSessionValue(sessionId, key) {
    const resp = await this.fetch(`/sessions/${encodeURIComponent(sessionId)}/values/${encodeURIComponent(key)}`, {
      method: "GET",
      headers: {
        ...this.config.headers
      }
    });
    if (!resp.ok) {
      const errorData = await resp.json().catch(() => ({}));
      throw new ApiError(errorData.error || "Failed to get session value", resp.status);
    }
    const data = await resp.json().catch(() => ({ value: null }));
    return data?.value ?? null;
  }
  /**
   * Session store: get all values in a session
   */
  async getSessionValues(sessionId) {
    const resp = await this.fetch(`/sessions/${encodeURIComponent(sessionId)}/values`, {
      method: "GET",
      headers: {
        ...this.config.headers
      }
    });
    if (!resp.ok) {
      const errorData = await resp.json().catch(() => ({}));
      throw new ApiError(errorData.error || "Failed to get session values", resp.status);
    }
    const data = await resp.json().catch(() => ({ values: {} }));
    return data?.values ?? {};
  }
  /**
   * Session store: delete a single key
   */
  async deleteSessionValue(sessionId, key) {
    const resp = await this.fetch(`/sessions/${encodeURIComponent(sessionId)}/values/${encodeURIComponent(key)}`, {
      method: "DELETE",
      headers: {
        ...this.config.headers
      }
    });
    if (!resp.ok && resp.status !== 204) {
      const errorData = await resp.json().catch(() => ({}));
      throw new ApiError(errorData.error || "Failed to delete session value", resp.status);
    }
  }
  /**
   * Session store: clear all keys in a session
   */
  async clearSession(sessionId) {
    const resp = await this.fetch(`/sessions/${encodeURIComponent(sessionId)}`, {
      method: "DELETE",
      headers: {
        ...this.config.headers
      }
    });
    if (!resp.ok && resp.status !== 204) {
      const errorData = await resp.json().catch(() => ({}));
      throw new ApiError(errorData.error || "Failed to clear session", resp.status);
    }
  }
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
  async issueToken() {
    const response = await this.fetch("/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.config.headers
      }
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new ApiError(errorData.error || "Failed to issue token", response.status);
    }
    const tokens = await response.json();
    if (!tokens?.access_token || !tokens?.refresh_token || typeof tokens?.expires_at !== "number") {
      throw new ApiError("Invalid token response", response.status);
    }
    this.applyTokens(tokens.access_token, tokens.refresh_token);
    return tokens;
  }
  /**
   * Get the current access/refresh tokens.
   */
  getTokens() {
    return { accessToken: this.accessToken, refreshToken: this.refreshToken };
  }
  /**
   * Update the access/refresh tokens in memory.
   */
  setTokens(tokens) {
    this.accessToken = tokens.accessToken;
    if (tokens.refreshToken) {
      this.refreshToken = tokens.refreshToken;
    }
  }
  /**
   * Reset all authentication tokens.
   */
  resetTokens() {
    this.accessToken = void 0;
    this.refreshToken = void 0;
  }
  /**
   * Start streaming speech-to-text transcription via WebSocket
   */
  async streamingTranscription(options = {}) {
    const baseUrl = this.config.baseUrl;
    const wsUrl = baseUrl.replace("http://", "ws://").replace("https://", "wss://") + "/voice/stream";
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      let isResolved = false;
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: "start_session" }));
        options.onStart?.();
        if (!isResolved) {
          isResolved = true;
          resolve({
            sendAudio: (audioData) => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(audioData);
              }
            },
            sendText: (text) => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "text_chunk", text }));
              }
            },
            stop: () => {
              if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: "end_session" }));
              }
            },
            close: () => {
              ws.close();
            }
          });
        }
      };
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          switch (data.type) {
            case "text_chunk":
              options.onTranscript?.(data.text || "", data.is_final || false);
              break;
            case "session_started":
              this.debug("Speech-to-text session started");
              break;
            case "session_ended":
              this.debug("Speech-to-text session ended");
              options.onEnd?.();
              break;
            case "error": {
              const error = new Error(data.message || "WebSocket error");
              this.debug("Speech-to-text error:", error);
              options.onError?.(error);
              break;
            }
            default:
              this.debug("Unknown message type:", data.type);
          }
        } catch (error) {
          const parseError = new Error("Failed to parse WebSocket message");
          this.debug("Parse error:", parseError);
          options.onError?.(parseError);
        }
      };
      ws.onerror = (event) => {
        const error = new Error("WebSocket connection error");
        this.debug("WebSocket error:", event);
        options.onError?.(error);
        if (!isResolved) {
          isResolved = true;
          reject(error);
        }
      };
      ws.onclose = (event) => {
        this.debug("WebSocket closed:", event.code, event.reason);
        options.onEnd?.();
      };
    });
  }
  /**
   * Transcribe audio blob to text using speech-to-text API
   */
  async transcribe(audioBlob, config = {}) {
    try {
      const arrayBuffer = await audioBlob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const base64String = btoa(String.fromCharCode(...uint8Array));
      const requestBody = {
        audio: base64String,
        model: config.model || "whisper-1",
        ...config.language && { language: config.language },
        ...config.temperature !== void 0 && { temperature: config.temperature }
      };
      this.debug("Transcribing audio:", {
        model: requestBody.model,
        language: config.language,
        audioSize: audioBlob.size
      });
      const response = await this.fetch(`/tts/transcribe`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.config.headers
        },
        body: JSON.stringify(requestBody)
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || `Transcription failed: ${response.status}`;
        throw new ApiError(errorMessage, response.status);
      }
      const result = await response.json();
      const transcription = result.text || "";
      this.debug("Transcription result:", { text: transcription });
      return transcription;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new DistriError("Failed to transcribe audio", "TRANSCRIPTION_ERROR", error);
    }
  }
  async getConfiguration() {
    const response = await this.fetch(`/configuration`, {
      method: "GET",
      headers: {
        ...this.config.headers
      }
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new ApiError(errorData.error || "Failed to load configuration", response.status);
    }
    return response.json();
  }
  async updateConfiguration(configuration) {
    const response = await this.fetch(`/configuration`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        ...this.config.headers
      },
      body: JSON.stringify(configuration)
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new ApiError(errorData.error || "Failed to update configuration", response.status);
    }
    return response.json();
  }
  /**
   * Minimal LLM helper that proxies to the Distri server using Distri messages.
   */
  async llm(messages, tools = [], options) {
    const headers = { "Content-Type": "application/json" };
    const response = await this.fetch(`/llm/execute`, {
      method: "POST",
      headers,
      body: JSON.stringify({ messages, tools, ...options })
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const message = errorData?.error || response.statusText || "LLM request failed";
      throw new ApiError(`LLM request failed: ${message}`, response.status);
    }
    return response.json();
  }
  /**
   * Get all available agents from the Distri server
   */
  async getAgents() {
    try {
      const response = await this.fetch(`/agents`, {
        headers: {
          ...this.config.headers
        }
      });
      if (!response.ok) {
        throw new ApiError(`Failed to fetch agents: ${response.statusText}`, response.status);
      }
      const agents = await response.json();
      agents.forEach((agent) => {
        if (!agent.id) {
          agent.id = agent.name;
        }
      });
      return agents;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new DistriError("Failed to fetch agents", "FETCH_ERROR", error);
    }
  }
  /**
   * Get specific agent by ID
   */
  async getAgent(agentId) {
    try {
      const response = await this.fetch(`/agents/${agentId}`, {
        headers: {
          ...this.config.headers
        }
      });
      if (!response.ok) {
        if (response.status === 404) {
          throw new ApiError(`Agent not found: ${agentId}`, 404);
        }
        throw new ApiError(`Failed to fetch agent: ${response.statusText}`, response.status);
      }
      const agent = await response.json();
      if (!agent.id) {
        agent.id = agentId;
      }
      return agent;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new DistriError(`Failed to fetch agent ${agentId}`, "FETCH_ERROR", error);
    }
  }
  /**
   * Update an agent's definition (markdown only)
   */
  async updateAgent(agentId, update) {
    try {
      const response = await this.fetch(`/agents/${agentId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...this.config.headers
        },
        body: JSON.stringify(update)
      });
      if (!response.ok) {
        if (response.status === 404) {
          throw new ApiError(`Agent not found: ${agentId}`, 404);
        }
        throw new ApiError(`Failed to update agent: ${response.statusText}`, response.status);
      }
      return await response.json();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new DistriError(`Failed to update agent ${agentId}`, "UPDATE_ERROR", error);
    }
  }
  /**
   * Get or create A2AClient for an agent
   */
  getA2AClient(agentId) {
    const agentUrl = `${this.config.baseUrl}/agents/${agentId}`;
    const existing = this.agentClients.get(agentId);
    if (!existing || existing.url !== agentUrl) {
      const fetchFn = this.fetchAbsolute.bind(this);
      const client = new A2AClient(agentUrl, fetchFn);
      this.agentClients.set(agentId, { url: agentUrl, client });
      this.debug(
        existing ? `Recreated A2AClient for agent ${agentId} with new URL ${agentUrl}` : `Created A2AClient for agent ${agentId} at ${agentUrl}`
      );
      return client;
    }
    return existing.client;
  }
  /**
   * Send a message to an agent
   */
  async sendMessage(agentId, params) {
    try {
      const client = this.getA2AClient(agentId);
      const response = await client.sendMessage(params);
      if ("error" in response && response.error) {
        throw new A2AProtocolError(response.error.message, response.error);
      }
      if ("result" in response) {
        const result = response.result;
        this.debug(`Message sent to ${agentId}, got ${result.kind}:`, result);
        return result;
      }
      throw new DistriError("Invalid response format", "INVALID_RESPONSE");
    } catch (error) {
      if (error instanceof A2AProtocolError || error instanceof DistriError) throw error;
      throw new DistriError(`Failed to send message to agent ${agentId}`, "SEND_MESSAGE_ERROR", error);
    }
  }
  /**
   * Send a streaming message to an agent
   */
  async *sendMessageStream(agentId, params) {
    console.log("sendMessageStream", agentId, params);
    try {
      const client = this.getA2AClient(agentId);
      yield* await client.sendMessageStream(params);
    } catch (error) {
      console.error(error);
      const errorMessage = this.extractErrorMessage(error);
      throw new DistriError(errorMessage, "STREAM_MESSAGE_ERROR", error);
    }
  }
  /**
   * Extract a user-friendly error message from potentially nested errors
   */
  extractErrorMessage(error) {
    if (!error) return "Unknown error occurred";
    if (typeof error === "object" && error !== null) {
      const err = error;
      if (err.error && typeof err.error === "object") {
        const jsonRpcError = err.error;
        if (typeof jsonRpcError.message === "string") {
          return jsonRpcError.message;
        }
      }
      if (err.message && typeof err.message === "string") {
        return err.message;
      }
      if (err.details && typeof err.details === "object") {
        const details = err.details;
        if (details.message && typeof details.message === "string") {
          return details.message;
        }
        if (details.error && typeof details.error === "object") {
          const nestedError = details.error;
          if (typeof nestedError.message === "string") {
            return nestedError.message;
          }
        }
      }
      if (err.cause && typeof err.cause === "object") {
        return this.extractErrorMessage(err.cause);
      }
    }
    if (error instanceof Error) {
      const msg = error.message;
      const sseMatch = msg.match(/SSE event contained an error:\s*(.+?)\s*\(Code:/);
      if (sseMatch) return sseMatch[1];
      const rpcMatch = msg.match(/RPC Error:\s*(.+?)\s*\(Code:/);
      if (rpcMatch) return rpcMatch[1];
      return msg;
    }
    return String(error);
  }
  /**
   * Get task details
   */
  async getTask(agentId, taskId) {
    try {
      const client = this.getA2AClient(agentId);
      const response = await client.getTask({ id: taskId });
      if ("error" in response && response.error) {
        throw new A2AProtocolError(response.error.message, response.error);
      }
      if ("result" in response) {
        const result = response.result;
        this.debug(`Got task ${taskId} from ${agentId}:`, result);
        return result;
      }
      throw new DistriError("Invalid response format", "INVALID_RESPONSE");
    } catch (error) {
      if (error instanceof A2AProtocolError || error instanceof DistriError) throw error;
      throw new DistriError(`Failed to get task ${taskId} from agent ${agentId}`, "GET_TASK_ERROR", error);
    }
  }
  /**
   * Cancel a task
   */
  async cancelTask(agentId, taskId) {
    try {
      const client = this.getA2AClient(agentId);
      await client.cancelTask({ id: taskId });
      this.debug(`Cancelled task ${taskId} on agent ${agentId}`);
    } catch (error) {
      throw new DistriError(`Failed to cancel task ${taskId} on agent ${agentId}`, "CANCEL_TASK_ERROR", error);
    }
  }
  /**
   * Get threads from Distri server with filtering and pagination
   */
  async getThreads(params = {}) {
    try {
      const searchParams = new URLSearchParams();
      if (params.agent_id) searchParams.set("agent_id", params.agent_id);
      if (params.external_id) searchParams.set("external_id", params.external_id);
      if (params.search) searchParams.set("search", params.search);
      if (params.from_date) searchParams.set("from_date", params.from_date);
      if (params.to_date) searchParams.set("to_date", params.to_date);
      if (params.tags?.length) searchParams.set("tags", params.tags.join(","));
      if (params.limit !== void 0) searchParams.set("limit", params.limit.toString());
      if (params.offset !== void 0) searchParams.set("offset", params.offset.toString());
      const queryString = searchParams.toString();
      const url = queryString ? `/threads?${queryString}` : "/threads";
      const response = await this.fetch(url);
      if (!response.ok) {
        throw new ApiError(`Failed to fetch threads: ${response.statusText}`, response.status);
      }
      return await response.json();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new DistriError("Failed to fetch threads", "FETCH_ERROR", error);
    }
  }
  /**
   * Get agents sorted by thread count (most active first).
   * Includes all registered agents, even those with 0 threads.
   * Optionally filter by name with search parameter.
   */
  async getAgentsByUsage(options) {
    try {
      const params = new URLSearchParams();
      if (options?.search) {
        params.set("search", options.search);
      }
      const query = params.toString();
      const url = query ? `/threads/agents?${query}` : "/threads/agents";
      const response = await this.fetch(url);
      if (!response.ok) {
        throw new ApiError(`Failed to fetch agents by usage: ${response.statusText}`, response.status);
      }
      return await response.json();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new DistriError("Failed to fetch agents by usage", "FETCH_ERROR", error);
    }
  }
  /**
   * Create a new browser session
   * Returns session info including viewer_url and stream_url from browsr
   */
  async createBrowserSession() {
    try {
      const response = await this.fetch("/browser/session", {
        method: "POST"
      });
      if (!response.ok) {
        throw new ApiError(`Failed to create browser session: ${response.statusText}`, response.status);
      }
      return await response.json();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new DistriError("Failed to create browser session", "FETCH_ERROR", error);
    }
  }
  async getThread(threadId) {
    try {
      const response = await this.fetch(`/threads/${threadId}`);
      if (!response.ok) {
        throw new ApiError(`Failed to fetch thread: ${response.statusText}`, response.status);
      }
      return await response.json();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new DistriError(`Failed to fetch thread ${threadId}`, "FETCH_ERROR", error);
    }
  }
  /**
   * Get thread messages
   */
  async getThreadMessages(threadId) {
    try {
      const response = await this.fetch(`/threads/${threadId}/messages`);
      if (!response.ok) {
        if (response.status === 404) {
          return [];
        }
        throw new ApiError(`Failed to fetch thread messages: ${response.statusText}`, response.status);
      }
      return await response.json();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new DistriError(`Failed to fetch messages for thread ${threadId}`, "FETCH_ERROR", error);
    }
  }
  /**
   * Get messages from a thread as DistriMessage format
   */
  async getThreadMessagesAsDistri(threadId) {
    const messages = await this.getThreadMessages(threadId);
    return messages.map(convertA2AMessageToDistri);
  }
  // ========== Message Read Status Methods ==========
  /**
   * Mark a message as read
   */
  async markMessageRead(threadId, messageId) {
    try {
      const response = await this.fetch(
        `/threads/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(messageId)}/read`,
        { method: "POST" }
      );
      if (!response.ok) {
        throw new ApiError(`Failed to mark message as read: ${response.statusText}`, response.status);
      }
      return await response.json();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new DistriError(`Failed to mark message ${messageId} as read`, "MARK_READ_ERROR", error);
    }
  }
  /**
   * Get read status for a specific message
   */
  async getMessageReadStatus(threadId, messageId) {
    try {
      const response = await this.fetch(
        `/threads/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(messageId)}/read`
      );
      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw new ApiError(`Failed to get message read status: ${response.statusText}`, response.status);
      }
      return await response.json();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new DistriError(`Failed to get read status for message ${messageId}`, "FETCH_ERROR", error);
    }
  }
  /**
   * Get read status for all messages in a thread
   */
  async getThreadReadStatus(threadId) {
    try {
      const response = await this.fetch(
        `/threads/${encodeURIComponent(threadId)}/read-status`
      );
      if (!response.ok) {
        throw new ApiError(`Failed to get thread read status: ${response.statusText}`, response.status);
      }
      return await response.json();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new DistriError(`Failed to get read status for thread ${threadId}`, "FETCH_ERROR", error);
    }
  }
  // ========== Message Voting Methods ==========
  /**
   * Vote on a message (upvote or downvote)
   * Downvotes require a comment explaining the issue
   */
  async voteMessage(threadId, messageId, request) {
    try {
      const response = await this.fetch(
        `/threads/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(messageId)}/vote`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request)
        }
      );
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new ApiError(errorData.error || `Failed to vote on message: ${response.statusText}`, response.status);
      }
      return await response.json();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new DistriError(`Failed to vote on message ${messageId}`, "VOTE_ERROR", error);
    }
  }
  /**
   * Remove vote from a message
   */
  async removeVote(threadId, messageId) {
    try {
      const response = await this.fetch(
        `/threads/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(messageId)}/vote`,
        { method: "DELETE" }
      );
      if (!response.ok && response.status !== 204) {
        throw new ApiError(`Failed to remove vote: ${response.statusText}`, response.status);
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new DistriError(`Failed to remove vote from message ${messageId}`, "VOTE_ERROR", error);
    }
  }
  /**
   * Get vote summary for a message (counts + current user's vote)
   */
  async getMessageVoteSummary(threadId, messageId) {
    try {
      const response = await this.fetch(
        `/threads/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(messageId)}/vote`
      );
      if (!response.ok) {
        throw new ApiError(`Failed to get vote summary: ${response.statusText}`, response.status);
      }
      return await response.json();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new DistriError(`Failed to get vote summary for message ${messageId}`, "FETCH_ERROR", error);
    }
  }
  /**
   * Get all votes for a message (admin/analytics use)
   */
  async getMessageVotes(threadId, messageId) {
    try {
      const response = await this.fetch(
        `/threads/${encodeURIComponent(threadId)}/messages/${encodeURIComponent(messageId)}/votes`
      );
      if (!response.ok) {
        throw new ApiError(`Failed to get message votes: ${response.statusText}`, response.status);
      }
      return await response.json();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new DistriError(`Failed to get votes for message ${messageId}`, "FETCH_ERROR", error);
    }
  }
  /**
   * Send a DistriMessage to a thread
   */
  async sendDistriMessage(threadId, message, context) {
    const a2aMessage = convertDistriMessageToA2A(message, context);
    const contextMetadata = context.getMetadata?.() || {};
    const params = {
      message: a2aMessage,
      metadata: contextMetadata
    };
    await this.sendMessage(threadId, params);
  }
  /**
   * Complete an external tool call
   */
  async completeTool(agentId, result) {
    try {
      const response = await this.fetch(`/agents/${agentId}/complete-tool`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.config.headers
        },
        body: JSON.stringify({
          tool_call_id: result.tool_call_id,
          tool_response: {
            tool_call_id: result.tool_call_id,
            tool_name: result.tool_name,
            parts: result.parts,
            parts_metadata: result.parts_metadata
          }
        })
      });
      if (!response.ok) {
        throw new ApiError(`Failed to complete tool: ${response.statusText}`, response.status);
      }
      this.debug(`Tool completed: ${result.tool_name} (${result.tool_call_id}) for agent ${agentId}`);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new DistriError(`Failed to complete tool ${result.tool_name} (${result.tool_call_id}) for agent ${agentId}`, "COMPLETE_TOOL_ERROR", error);
    }
  }
  /**
   * Complete an inline hook with a mutation payload.
   */
  async completeInlineHook(hookId, mutation) {
    const response = await this.fetch(`/event/hooks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.config.headers
      },
      body: JSON.stringify({
        hook_id: hookId,
        mutation
      })
    });
    if (!response.ok) {
      throw new ApiError(`Failed to complete inline hook: ${response.statusText}`, response.status);
    }
  }
  /**
   * Get the base URL for making direct requests
   */
  get baseUrl() {
    return this.config.baseUrl;
  }
  applyTokens(accessToken, refreshToken) {
    this.accessToken = accessToken;
    if (refreshToken) {
      this.refreshToken = refreshToken;
    }
  }
  /**
   * Ensure access token is valid, refreshing if necessary
   */
  async ensureAccessToken() {
    if (!this.refreshToken && !this.onTokenRefresh) {
      return;
    }
    if (!this.accessToken || this.isTokenExpiring(this.accessToken)) {
      try {
        await this.refreshTokens();
      } catch (error) {
        this.debug("Token refresh failed:", error);
      }
    }
  }
  async refreshTokens() {
    if (!this.refreshToken && !this.onTokenRefresh) {
      return;
    }
    if (!this.refreshPromise) {
      this.refreshPromise = this.performTokenRefresh().finally(() => {
        this.refreshPromise = void 0;
      });
    }
    return this.refreshPromise;
  }
  async performTokenRefresh() {
    if (this.onTokenRefresh) {
      this.accessToken = void 0;
      const newToken = await this.onTokenRefresh();
      if (newToken) {
        this.applyTokens(newToken);
        return;
      }
    }
    if (!this.refreshToken) {
      return;
    }
    const response = await this.fetchAbsolute(
      `${this.config.baseUrl}/token`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.config.headers
        },
        body: JSON.stringify({
          grant_type: "refresh_token",
          refresh_token: this.refreshToken
        })
      },
      { skipAuth: true, retryOnAuth: false }
    );
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new ApiError(errorData.error || "Failed to refresh token", response.status);
    }
    const tokens = await response.json();
    if (!tokens?.access_token || !tokens?.refresh_token) {
      throw new ApiError("Invalid token response", response.status);
    }
    this.applyTokens(tokens.access_token, tokens.refresh_token);
  }
  isTokenExpiring(token) {
    const expiresAt = this.getTokenExpiry(token);
    if (!expiresAt) {
      return false;
    }
    return expiresAt <= Date.now() + this.tokenRefreshSkewMs;
  }
  getTokenExpiry(token) {
    const payload = this.decodeJwtPayload(token);
    const exp = payload?.exp;
    if (typeof exp !== "number") {
      return null;
    }
    return exp * 1e3;
  }
  decodeJwtPayload(token) {
    const parts = token.split(".");
    if (parts.length < 2) {
      return null;
    }
    const decoded = this.decodeBase64Url(parts[1]);
    if (!decoded) {
      return null;
    }
    try {
      return JSON.parse(decoded);
    } catch {
      return null;
    }
  }
  decodeBase64Url(value) {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    try {
      if (typeof atob === "function") {
        return atob(padded);
      }
      const buffer = globalThis.Buffer;
      if (typeof buffer !== "undefined") {
        return buffer.from(padded, "base64").toString("utf8");
      }
    } catch {
      return null;
    }
    return null;
  }
  applyAuthHeader(headers) {
    if (this.accessToken && !headers.has("authorization")) {
      headers.set("Authorization", `Bearer ${this.accessToken}`);
    }
  }
  /**
   * Enhanced fetch with retry logic
   */
  async fetchAbsolute(url, initialInit, options) {
    const { skipAuth = false, retryOnAuth = true } = options ?? {};
    const init = await this.config.interceptor(initialInit);
    let lastError;
    const headers = new Headers();
    const applyHeaders = (src) => {
      if (!src) return;
      if (src instanceof Headers) {
        src.forEach((value, key) => headers.set(key, value));
      } else if (Array.isArray(src)) {
        src.forEach(([key, value]) => headers.set(key, value));
      } else if (typeof src === "object") {
        Object.entries(src).forEach(([key, value]) => {
          if (typeof value === "string") {
            headers.set(key, value);
          }
        });
      }
    };
    applyHeaders(this.config.headers);
    applyHeaders(init?.headers);
    const hasBody = init?.body !== void 0 && !(init.body instanceof FormData) && !(init.body instanceof Blob);
    if (!headers.has("content-type") && hasBody) {
      headers.set("Content-Type", "application/json");
    }
    if (!skipAuth) {
      await this.ensureAccessToken();
      this.applyAuthHeader(headers);
    }
    for (let attempt = 0; attempt <= this.config.retryAttempts; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);
        const response = await fetch(url, {
          ...init,
          signal: controller.signal,
          headers
        });
        clearTimeout(timeoutId);
        if (!skipAuth && retryOnAuth && response.status === 401 && (this.refreshToken || this.onTokenRefresh)) {
          const refreshed = await this.refreshTokens().then(() => true).catch(() => false);
          if (refreshed) {
            return this.fetchAbsolute(url, initialInit, { skipAuth, retryOnAuth: false });
          }
        }
        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < this.config.retryAttempts) {
          this.debug(`Request failed (attempt ${attempt + 1}), retrying in ${this.config.retryDelay}ms...`);
          await this.delay(this.config.retryDelay);
        }
      }
    }
    throw lastError;
  }
  /**
   * Enhanced fetch with retry logic and auth headers.
   * Exposed publicly for extensions like DistriHomeClient.
   */
  async fetch(input, initialInit) {
    const url = `${this.config.baseUrl}${input}`;
    return this.fetchAbsolute(url, initialInit);
  }
  /**
   * Delay utility
   */
  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  /**
   * Debug logging
   */
  debug(...args) {
    if (this.config.debug) {
      console.log("[DistriClient]", ...args);
    }
  }
  /**
   * Helper method to create A2A messages
   */
  static initMessage(parts, role = "user", message) {
    return {
      messageId: message.messageId || uuidv4(),
      taskId: message.taskId || uuidv4(),
      contextId: message.contextId,
      role,
      parts: Array.isArray(parts) ? parts : [{ kind: "text", text: parts.trim() }],
      ...message,
      kind: "message"
    };
  }
  /**
   * Create a DistriMessage instance
   */
  static initDistriMessage(role, parts, id, created_at) {
    return {
      id: id || uuidv4(),
      role,
      parts,
      created_at: created_at || (/* @__PURE__ */ new Date()).getTime()
    };
  }
  /**
   * Helper method to create message send parameters.
   *
   * Pass `dynamicMetadata` to inject `dynamic_sections` and/or `dynamic_values`
   * into the metadata so the server can apply them to prompt templates.
   */
  static initMessageParams(message, configuration, metadata, dynamicMetadata) {
    const mergedMetadata = {
      ...metadata,
      ...dynamicMetadata?.dynamic_sections ? { dynamic_sections: dynamicMetadata.dynamic_sections } : {},
      ...dynamicMetadata?.dynamic_values ? { dynamic_values: dynamicMetadata.dynamic_values } : {}
    };
    return {
      message,
      configuration: {
        acceptedOutputModes: ["text/plain"],
        blocking: false,
        // Default to non-blocking for streaming
        ...configuration
      },
      metadata: Object.keys(mergedMetadata).length > 0 ? mergedMetadata : metadata
    };
  }
  /**
   * Create MessageSendParams from a DistriMessage using InvokeContext.
   *
   * Pass `dynamicMetadata` to inject `dynamic_sections` and/or `dynamic_values`
   * into the metadata so the server can apply them to prompt templates.
   */
  static initDistriMessageParams(message, context, dynamicMetadata) {
    const a2aMessage = convertDistriMessageToA2A(message, context);
    const contextMetadata = context.getMetadata?.() || {};
    const mergedMetadata = {
      ...contextMetadata,
      ...dynamicMetadata?.dynamic_sections ? { dynamic_sections: dynamicMetadata.dynamic_sections } : {},
      ...dynamicMetadata?.dynamic_values ? { dynamic_values: dynamicMetadata.dynamic_values } : {}
    };
    return {
      message: a2aMessage,
      metadata: Object.keys(mergedMetadata).length > 0 ? mergedMetadata : contextMetadata
    };
  }
};
// ============================================================
// Token API
// ============================================================
// Issue access + refresh tokens for temporary authentication (e.g., frontend use)
/**
 * Response from the token endpoint
 */
_DistriClient.TokenType = {
  Main: "main",
  Short: "short"
};
var DistriClient = _DistriClient;
function uuidv4() {
  if (typeof crypto?.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  array[6] = array[6] & 15 | 64;
  array[8] = array[8] & 63 | 128;
  return [...array].map(
    (b, i) => ([4, 6, 8, 10].includes(i) ? "-" : "") + b.toString(16).padStart(2, "0")
  ).join("");
}

// src/agent.ts
var ExternalToolValidationError = class extends DistriError {
  constructor(agentName, result) {
    super(
      result.message || "Missing required external tools for agent invocation.",
      "EXTERNAL_TOOL_VALIDATION_ERROR",
      {
        agentName,
        missingTools: result.missingTools,
        requiredTools: result.requiredTools,
        providedTools: result.providedTools
      }
    );
    this.name = "ExternalToolValidationError";
    this.agentName = agentName;
    this.missingTools = result.missingTools;
    this.requiredTools = result.requiredTools;
    this.providedTools = result.providedTools;
  }
};
var Agent = class _Agent {
  constructor(agentDefinition, client) {
    this.hookHandlers = /* @__PURE__ */ new Map();
    this.defaultHookHandler = null;
    this.agentDefinition = agentDefinition;
    this.client = client;
  }
  /**
   * Get agent information
   */
  get id() {
    return this.agentDefinition.id;
  }
  get name() {
    return this.agentDefinition.name;
  }
  get description() {
    return this.agentDefinition.description;
  }
  get agentType() {
    return this.agentDefinition.agent_type;
  }
  get iconUrl() {
    return this.agentDefinition.icon_url;
  }
  /**
   * Get the full agent definition (including backend tools)
   */
  getDefinition() {
    return this.agentDefinition;
  }
  /**
   * Fetch messages for a thread (public method for useChat)
   */
  async getThreadMessages(threadId) {
    return this.client.getThreadMessages(threadId);
  }
  /**
   * Direct (non-streaming) invoke
   */
  async invoke(params, tools, hooks) {
    if (hooks) {
      this.registerHooks(hooks);
    }
    const enhancedParams = this.enhanceParamsWithTools(params, tools);
    return await this.client.sendMessage(this.agentDefinition.id, enhancedParams);
  }
  /**
   * Streaming invoke
   */
  async invokeStream(params, tools, hooks) {
    if (hooks) {
      this.registerHooks(hooks);
    }
    const enhancedParams = this.enhanceParamsWithTools(params, tools);
    const a2aStream = this.client.sendMessageStream(this.agentDefinition.id, enhancedParams);
    const self = this;
    return async function* () {
      try {
        for await (const event of a2aStream) {
          const converted = decodeA2AStreamEvent(event);
          if (converted && converted.type === "inline_hook_requested") {
            const hookReq = converted.data;
            const handler = self.hookHandlers.get(hookReq.hook) || self.defaultHookHandler;
            if (handler) {
              try {
                const mutation = await handler(hookReq);
                await self.client.completeInlineHook(hookReq.hook_id, mutation);
              } catch (err) {
                await self.client.completeInlineHook(hookReq.hook_id, { dynamic_values: {} });
              }
            } else {
              await self.client.completeInlineHook(hookReq.hook_id, { dynamic_values: {} });
            }
            yield converted;
          } else if (converted) {
            yield converted;
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const runError = {
          type: "run_error",
          data: {
            message,
            code: "STREAM_ERROR"
          }
        };
        yield runError;
      }
    }();
  }
  /**
   * Validate that required external tools are registered before invoking.
   */
  validateExternalTools(tools = []) {
    const requiredTools = this.getRequiredExternalTools();
    const providedTools = tools.map((tool) => tool.name);
    if (requiredTools.length === 0) {
      return {
        isValid: true,
        requiredTools: [],
        providedTools,
        missingTools: []
      };
    }
    const providedSet = new Set(providedTools);
    const missingTools = requiredTools.filter((tool) => !providedSet.has(tool));
    const isValid = missingTools.length === 0;
    return {
      isValid,
      requiredTools,
      providedTools,
      missingTools,
      message: isValid ? void 0 : this.formatExternalToolValidationMessage(requiredTools, missingTools)
    };
  }
  /**
   * Enhance message params with tool definitions and dynamic metadata.
   *
   * When `dynamic_sections` or `dynamic_values` are present in `params.metadata`,
   * they are forwarded so the server injects them into the prompt template.
   */
  enhanceParamsWithTools(params, tools) {
    this.assertExternalTools(tools);
    const existingMeta = params.metadata ?? {};
    const metadata = {
      ...existingMeta,
      external_tools: tools?.map((tool) => ({
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
        is_final: tool.is_final
      })) || []
    };
    return {
      ...params,
      metadata
    };
  }
  assertExternalTools(tools) {
    const result = this.validateExternalTools(tools ?? []);
    if (!result.isValid) {
      throw new ExternalToolValidationError(this.agentDefinition.name || this.agentDefinition.id, result);
    }
  }
  getRequiredExternalTools() {
    const toolConfig = this.resolveToolConfig();
    if (!toolConfig?.external || !Array.isArray(toolConfig.external)) {
      return [];
    }
    if (toolConfig.external.includes("*")) {
      return [];
    }
    return toolConfig.external.filter((tool) => typeof tool === "string" && tool.trim().length > 0);
  }
  resolveToolConfig() {
    const root = this.agentDefinition;
    return this.extractToolConfig(root) || this.extractToolConfig(root?.agent) || this.extractToolConfig(root?.definition);
  }
  extractToolConfig(candidate) {
    if (!candidate) return null;
    const tools = candidate.tools;
    if (!tools || Array.isArray(tools) || typeof tools !== "object") {
      return null;
    }
    return tools;
  }
  formatExternalToolValidationMessage(requiredTools, missingTools) {
    const requiredList = requiredTools.join(", ");
    const missingList = missingTools.join(", ");
    return `Agent has external tools that are not registered: ${missingList}. This is an embedded agent that can run within the parent application. Register DistriWidget for embedding the parent component. Required tools: ${requiredList}.`;
  }
  /**
   * Register multiple hooks at once.
   */
  registerHooks(hooks, defaultHandler) {
    Object.entries(hooks).forEach(([hook, handler]) => {
      this.hookHandlers.set(hook, handler);
    });
    if (defaultHandler) {
      this.defaultHookHandler = defaultHandler;
    }
  }
  /**
   * Create an agent instance from an agent ID
   */
  static async create(agentIdOrDef, client) {
    const agentDefinition = typeof agentIdOrDef === "string" ? await client.getAgent(agentIdOrDef) : agentIdOrDef;
    const tools = agentDefinition?.resolved_tools || [];
    console.log("\u{1F916} Agent definition loaded:", {
      id: agentDefinition.id,
      name: agentDefinition.name,
      tools: tools.map((t) => ({
        name: t.name,
        type: "function"
      })) || [],
      toolCount: agentDefinition.tools?.length || 0
    });
    return new _Agent(agentDefinition, client);
  }
  /**
   * Complete an external tool call by sending the result back to the server
   */
  async completeTool(result) {
    await this.client.completeTool(this.agentDefinition.id, result);
  }
  /**
   * List all available agents
   */
  static async list(client) {
    const agentDefinitions = await client.getAgents();
    return agentDefinitions.map((def) => new _Agent(def, client));
  }
};
export {
  A2AProtocolError,
  Agent,
  ApiError,
  ConnectionError,
  DEFAULT_BASE_URL,
  DistriClient,
  DistriError,
  ExternalToolValidationError,
  convertA2AMessageToDistri,
  convertA2APartToDistri,
  convertA2AStatusUpdateToDistri,
  convertDistriMessageToA2A,
  convertDistriPartToA2A,
  createFailedToolResult,
  createSuccessfulToolResult,
  decodeA2AStreamEvent,
  extractTextFromDistriMessage,
  extractToolCallsFromDistriMessage,
  extractToolResultData,
  extractToolResultsFromDistriMessage,
  isArrayParts,
  isDistriEvent,
  isDistriMessage,
  processA2AMessagesData,
  processA2AStreamData,
  uuidv4
};
//# sourceMappingURL=index.mjs.map