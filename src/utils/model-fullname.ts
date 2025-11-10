import { ModelInfo, ModelProviderInfo } from "@/types/models";

// export const getModelFullName = (model: ModelPricing) => {
//     return `${model.inference_provider.provider}/${model.model}`
// };
export const getModelFullName = (model: ModelInfo, provider: ModelProviderInfo) => {
    return `${provider.provider.provider}/${model.model}`;
};
