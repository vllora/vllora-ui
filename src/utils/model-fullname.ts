import { LocalModel, LocalModelProviderInfo } from "@/types/models";

// export const getModelFullName = (model: ModelPricing) => {
//     return `${model.inference_provider.provider}/${model.model}`
// };
export const getModelFullName = (model: LocalModel, provider: LocalModelProviderInfo) => {
    return `${provider.provider.provider}/${model.model}`;
};
