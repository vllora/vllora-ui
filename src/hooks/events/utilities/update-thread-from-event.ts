import { ProjectEventUnion, CustomEvent, CustomLlmStartEventType, CustomCostEventType } from "@/contexts/project-events/dto";
import { Thread } from "@/types/chat";


export const updateThreadFromEvent = (threadInput: Thread, event: ProjectEventUnion): Thread => {
  let result = threadInput;
  if(event.thread_id === threadInput.thread_id){
    result = {
      ...threadInput,
      thread_id: event.thread_id,
      is_from_local: false,
    }
  }
  result = handleStartedFinishedEvent(result, event);
  if(event.type === 'Custom'){
    let customEvent = event as CustomEvent;
    if(customEvent.event.type === 'llm_start'){
      result = handleLLMStarted(result, customEvent);
    }
    if(customEvent.event.type === 'cost'){
      result = handleCost(result, customEvent);
    }
  }
  return result;
}

const handleStartedFinishedEvent = (threadInput: Thread, event: ProjectEventUnion): Thread => {
  let result = threadInput;
  if(event.thread_id === threadInput.thread_id){

    let eventRunId = event.run_id;
    let updatedThreadRunIds = eventRunId ? (threadInput.run_ids.includes(eventRunId) ? threadInput.run_ids : [...threadInput.run_ids, eventRunId]) : threadInput.run_ids;
    result = {
      ...threadInput,
      thread_id: event.thread_id,
      is_from_local: false,
      finish_time_us: event.timestamp * 1000,
      run_ids: updatedThreadRunIds
    }
  }
  return result;
}

const handleLLMStarted = (threadInput:Thread, event:CustomEvent): Thread => {
  let result = threadInput;
  let llmStartedEvent = event.event as CustomLlmStartEventType;
  if(llmStartedEvent){
    let newInputModels = [...threadInput.input_models, `${llmStartedEvent.provider_name}/${llmStartedEvent.model_name}`];
    let uniqueInputModels = Array.from(new Set(newInputModels));
    result = {
      ...threadInput,
      input_models: uniqueInputModels
    }
  }
  return result;
}

const handleCost = (threadInput:Thread, event:CustomEvent): Thread => {
  let result = threadInput;
  let costEvent = event.event as CustomCostEventType;
  if(costEvent){
    result = {
      ...threadInput,
      cost: threadInput.cost + costEvent.value.cost,
    }
  }
  return result;
}
 
