import { ModelPricing } from "@/types/models";

export const getModelFullName = (model: ModelPricing) => {
    return `${model.inference_provider.provider}/${model.model}`
};

export const getModelByName = (props: {name: string, modelPrices: ModelPricing[]}) => {
    const {name, modelPrices} = props;
    return modelPrices.find((model) => {
        if(name.includes('/')) {
            return getModelFullName(model) == name;
        }
        return getModelFullName(model) == name || model.model === name;
    });
};
