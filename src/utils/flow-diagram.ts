import { Span } from "@/types/common-type";
import { tryParseJson } from "@/utils/modelUtils";

export interface FlowNode {
  id: string;
  type: "system" | "user" | "model" | "tool" | "assistant";
  label: string;
  content?: any;
}

export interface FlowEdge {
  source: string;
  target: string;
  type: any;
  id: string;
  data?: any;
  index?: number;
  callGroup?: number;
}

export interface FlowDiagram {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

/**
 * Simple, fast hash function (cyrb53) for generating unique message identifiers.
 * Produces a 53-bit hash as a hex string.
 */
const cyrb53 = (str: string, seed = 0): string => {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hash = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return hash.toString(16);
};

/**
 * Generates a unique hash for a message based on its key properties.
 * Uses cyrb53 for efficient hashing of the message signature.
 */
export const getHashOfMessage = (message: any): string => {
  const signature = [
    message.type ?? "",
    message.model_name ?? "",
    message.role ?? "",
    message.content ?? "",
    message.tool_calls ? JSON.stringify(message.tool_calls) : "",
    message.tool_call_id ?? "",
  ].join("|");

  return cyrb53(signature);
};

export const getHashOfObject = (inputObject: any): string => {
  return cyrb53(JSON.stringify(inputObject));
};

const removeDuplicateNodes = (nodes: FlowNode[]) => {
  const nodeIds = new Set<string>();
  return nodes.filter((node) => {
    if (nodeIds.has(node.id)) {
      return false;
    }
    nodeIds.add(node.id);
    return true;
  });
};

const removeDuplicateEdges = (edges: FlowEdge[]) => {
  const edgeIds = new Set<string>();
  return edges.filter((edge) => {
    if (edgeIds.has(edge.id)) {
      return false;
    }
    edgeIds.add(edge.id);
    return true;
  });
};

/**
 * Creates a tool node and edge from a function response object.
 * Used when processing tool calls from model responses.
 *
 * @param functionResponse - The function response object containing function name and id
 * @param sourceNodeId - The id of the source node (typically a model node)
 * @returns Object containing the tool node and edge, or null if invalid
 */
export const createToolNodeAndEdge = (
  functionResponse: { function?: { name?: string }; id?: string },
  sourceNodeId: string
): { node: FlowNode; edge: FlowEdge } | null => {
  if (!functionResponse.function?.name) {
    return null;
  }

  const toolName = functionResponse.function.name;

  const node: FlowNode = {
    id: toolName,
    type: "tool",
    content: toolName,
    label: "",
  };

  const edge: FlowEdge = {
    id: `invoke_${functionResponse.id || ""}`,
    source: sourceNodeId,
    target: toolName,
    type: "tool_call",
  };

  return { node, edge };
};

export const createToolResponseNodeAndEdge = (
  dictionary: { [tool_call_id: string]: any },
  tool_call_id: string,
  result_tool: any,
  model_node_id: string
): { node: FlowNode; edge: FlowEdge } | null => {
  let toolByToolId = dictionary[tool_call_id];
  if (!toolByToolId) {
    return null;
  }

  const toolName = toolByToolId.function.name;

  const node: FlowNode = {
    id: toolName,
    type: "tool",
    content: toolName,
    label: "",
  };

  const edge: FlowEdge = {
    id: `response_${tool_call_id}`,
    source: toolName,
    target: model_node_id,
    type: "tool_response",
    data: result_tool,
  };

  return { node, edge };
};

/**
 * Builds a flow diagram (nodes and edges) directly from spans.
 * This is more accurate than building from deduplicated messages because:
 * - Each span represents ONE complete LLM call
 * - We know exactly which system + user was sent to which model
 * - The model name comes from attribute.request.model (accurate)
 * - Tool calls come from the output (accurate)
 *
 * Node types:
 * - system: System prompt (optional, unique by hash)
 * - user: User message (optional, unique by hash)
 * - model: Model/LLM (unique by model name)
 * - tool: Tool (unique by tool name)
 *
 * Edge types:
 * - input: system/user → model
 * - tool_call: model → tool
 * - tool_response: tool → model
 */
export const buildFlowDiagramFromSpans = (spans: Span[]): FlowDiagram => {
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];

  let messagesBySpan: {
    span: Span;
    request?: any;
    response?: any;
    raw_input_messages?: any[];
    nodes: FlowNode[];
    edges: FlowEdge[];
    previous_ref_span_id?: string;
    added_messages?: any[];
  }[] = [];

  let toolcallsIdAndFunction: { [tool_call_id: string]: any } = {};
  // Process each span (each span = one LLM call)
  spans
    .sort((a, b) => a.start_time_us - b.start_time_us)
    .forEach((span) => {
      try {
        let attr = span.attribute as any;
        const requestStr = attr?.request || attr?.input;
        const requestObj = requestStr && tryParseJson(requestStr);
        const responseStr = attr?.output || attr?.response;
        const responseObj = responseStr && tryParseJson(responseStr);

        let messagesFromRequest = requestObj?.messages || [];

        let nodes: FlowNode[] = [];
        let edges: FlowEdge[] = [];

        let modelNode: FlowNode | null = null;
        if (requestObj?.model) {
          modelNode = {
            id: requestObj.model,
            type: "model",
            content: requestObj.model,
            label: "",
          };
        }
        messagesFromRequest.forEach((message: any) => {
          if (message.role === "system" || message.role === "user") {
            let messageHash = getHashOfObject({
              role: message.role,
              content: message.content,
            });
            nodes.push({
              id: messageHash,
              type: message.role,
              content: message.content,
              label: "",
            });
            if (modelNode && modelNode.id) {
              edges.push({
                id: messageHash + "-" + modelNode.id,
                source: messageHash,
                target: modelNode.id,
                type: "input",
              });
            }
            return;
          }
          if (message.role === "assistant") {
            if (
              !message.content &&
              modelNode?.id &&
              message.tool_calls &&
              Array.isArray(message.tool_calls) &&
              message.tool_calls.length > 0
            ) {
              message.tool_calls.forEach((tool_call: any) => {
                toolcallsIdAndFunction[tool_call.id] = tool_call.function;
                const result = createToolNodeAndEdge(tool_call, modelNode?.id);
                if (result) {
                  nodes.push(result.node);
                  edges.push(result.edge);
                }
              });
            }
            if(message.content && modelNode?.id ){
              nodes.push({
                id: message.content,
                type: "assistant",
                content: message.content,
                label: "",
              });
              edges.push({
                id: message.content + "-" + modelNode.id,
                source: message.content,
                target: modelNode.id,
                type: "output",
              });
            }
            return;
          }
          if (message.role === "tool") {
            // Handle tool messages if needed
          }
        });
        if (modelNode && modelNode.id) {
          nodes.push(modelNode);
        }
        // if response object is array => mean tool invoke
        if (modelNode && responseObj && Array.isArray(responseObj)) {
          responseObj.forEach((resFun) => {
            toolcallsIdAndFunction[resFun.id] = resFun.function;
            const result = createToolNodeAndEdge(resFun, modelNode.id);
            if (result) {
              nodes.push(result.node);
              edges.push(result.edge);
            }
          });
        }
        // remove duplicate nodes
        nodes = removeDuplicateNodes(nodes);

        messagesBySpan.push({
          span,
          raw_input_messages: messagesFromRequest,
          request: requestObj,
          response: responseObj || responseStr,
          nodes,
          edges,
        });
      } catch {
        // Skip span if any error
      }
    });
  messagesBySpan.forEach((messageBySpan, idx) => {
    if (idx === 0) {
      return;
    }
    const previousSpan = messagesBySpan[idx - 1];
    if (
      previousSpan &&
      previousSpan.raw_input_messages &&
      previousSpan.raw_input_messages.length > 0
    ) {
      let previousSpanMessageHash = previousSpan.raw_input_messages.map((m) =>
        getHashOfMessage(m)
      );
      let currentSpanMessageHash = messageBySpan.raw_input_messages?.map((m) =>
        getHashOfMessage(m)
      );
      if (
        previousSpanMessageHash.length > 0 &&
        currentSpanMessageHash &&
        currentSpanMessageHash.length > 0
      ) {
        let stringHashPrevious = previousSpanMessageHash.join(",");
        let stringHashCurrent = currentSpanMessageHash.join(",");
        if (
          stringHashCurrent.startsWith(stringHashPrevious) &&
          currentSpanMessageHash?.length >= previousSpanMessageHash.length
        ) {
          messageBySpan.previous_ref_span_id = previousSpan.span.span_id;
          // added message is the sub element from
          let addedMessages = [...(messageBySpan.raw_input_messages || [])];
          addedMessages.splice(0, previousSpanMessageHash.length);
          messageBySpan.added_messages = addedMessages;
        }
      }
    }
  });

  // accumulate nodes and edgets 
  messagesBySpan.forEach(m => {
    nodes.push(...m.nodes);
    edges.push(...m.edges);
  })

 
  // remove duplicate nodes by id 
  let node_result = removeDuplicateNodes(nodes);
  let edge_result = removeDuplicateEdges(edges);

  console.log('===== messagesBySpan', messagesBySpan);
  console.log('==== nodes', node_result);
  console.log('==== edges', edge_result);

  return { nodes: node_result, edges: edge_result };
};
