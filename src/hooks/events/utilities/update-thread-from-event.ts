import {
  ProjectEventUnion,
  CustomEvent,
  CustomLlmStartEventType,
  CustomCostEventType,
} from "@/contexts/project-events/dto";
import { Thread } from "@/types/chat";
import { tryParseJson } from "@/utils/modelUtils";

export const updateThreadFromEvent = (
  threadInput: Thread,
  event: ProjectEventUnion
): Thread => {
  let result = threadInput;
  if (event.thread_id === threadInput.thread_id) {
    result = {
      ...threadInput,
      thread_id: event.thread_id,
      is_from_local: false,
    };
  }
  result = handleStartedFinishedEvent(result, event);
  if (event.type === "Custom") {
    let customEvent = event as CustomEvent;
    if (customEvent.event.type === "llm_start") {
      result = handleLLMStarted(result, customEvent);
    }
    if (customEvent.event.type === "cost") {
      result = handleCost(result, customEvent);
    }
    if (customEvent.event.type === "span_end" && !threadInput.title) {
      let attributes = customEvent.event.attributes as any;
      if (attributes.input) {
        let inputStr = attributes.input;
        let jsonMsg = tryParseJson(inputStr);
        if (jsonMsg && Array.isArray(jsonMsg) && jsonMsg.length > 0) {
          let messages = jsonMsg as any[];
          // check if any message is a user message
          let userMsg = messages.find((m) => m.role === "user" && m.content);
          if (userMsg) {
            let userMessageContent = userMsg.content;
            let typeOfMessage = typeof userMessageContent;
            if (typeOfMessage === "string") {
              let splitContent =
                userMessageContent && userMessageContent.split(" ");
              // only take first 20 words
              let first20Words = splitContent
                .slice(0, Math.min(splitContent.length, 20))
                .join(" ");
              result = {
                ...threadInput,
                title: first20Words,
              };
            } else {
              if (Array.isArray(userMessageContent)) {
                let arrayUserMessageContent = userMessageContent as any[]
                if(arrayUserMessageContent.length > 0) {
                  // get first element 
                  let firstElement = arrayUserMessageContent[0]
                  if(firstElement && firstElement.type === 'text') {
                    let firstElementContent = firstElement.content || firstElement.text
                    let splitContent = firstElementContent?.split(" ")
                    let first20Words = splitContent?.slice(0, Math.min(splitContent.length, 20)).join(" ");
                    result = {
                      ...threadInput,
                      title: first20Words,
                    };
                  }
                }
              }
            }
          } else {
            // take first 20 words of the first message
            let first20Words = messages[0].content
              .split(" ")
              .slice(0, Math.min(messages[0].content.split(" ").length, 20))
              .join(" ");
            result = {
              ...threadInput,
              title: first20Words,
            };
          }
        }
      }
    }
  }
  return result;
};

const handleStartedFinishedEvent = (
  threadInput: Thread,
  event: ProjectEventUnion
): Thread => {
  let result = threadInput;
  if (event.thread_id === threadInput.thread_id) {
    let eventRunId = event.run_id;
    let updatedThreadRunIds = eventRunId
      ? threadInput.run_ids.includes(eventRunId)
        ? threadInput.run_ids
        : [...threadInput.run_ids, eventRunId]
      : threadInput.run_ids;
    result = {
      ...threadInput,
      thread_id: event.thread_id,
      is_from_local: false,
      finish_time_us: event.timestamp * 1000,
      run_ids: updatedThreadRunIds,
    };
  }
  return result;
};

const handleLLMStarted = (threadInput: Thread, event: CustomEvent): Thread => {
  let result = threadInput;
  let llmStartedEvent = event.event as CustomLlmStartEventType;
  if (llmStartedEvent) {
    let newInputModels = [
      ...threadInput.input_models,
      `${llmStartedEvent.provider_name}/${llmStartedEvent.model_name}`,
    ];
    let uniqueInputModels = Array.from(new Set(newInputModels));
    result = {
      ...threadInput,
      input_models: uniqueInputModels,
    };
  }
  return result;
};

const handleCost = (threadInput: Thread, event: CustomEvent): Thread => {
  let result = threadInput;
  let costEvent = event.event as CustomCostEventType;
  if (costEvent) {
    result = {
      ...threadInput,
      cost: threadInput.cost + costEvent.value.cost,
    };
  }
  return result;
};
