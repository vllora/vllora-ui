import { ProjectModelsConsumer } from "@/contexts/ProjectModelsContext";
import { ModelInfo, ModelProviderInfo } from "@/types/models";
import { useCallback, useEffect, useMemo, useState } from "react";
import { VirtualModelsConsumer } from "@/contexts/VirtualModelsContext";
import { VirtualModel } from "@/lib";

export const useUserProviderOfSelectedModelConfig = (props: {
  selectedModel: string;
}) => {
  const { selectedModel } = props;
  const { models } = ProjectModelsConsumer();
  const { virtualModels } = VirtualModelsConsumer();
  const [selectedProviderForConfig, setSelectedProviderForConfig] = useState<
    string | undefined
  >(undefined);
  const [providerListDialogOpen, setProviderListDialogOpen] = useState(false);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [modelConfig, setModelConfig] = useState<Record<string, any>>({});
  useEffect(() => {
    setModelConfig(prev => ({
      ...prev,
      model: selectedModel || "openai/gpt-4o-mini",
    }));
  }, [selectedModel]);

  const selectedModelInfo: ModelInfo | VirtualModel | undefined =
    useMemo(() => {
      let isFullName = selectedModel.includes("/");
      if (isFullName) {
        let splited = selectedModel.split("/");
        let modelName = splited[1];
        if (selectedModel.startsWith("langdb/")) {
          return virtualModels.find((model) => model.slug === modelName);
        }
        let modelInfo = models.find((model) => model.model === modelName);
        return modelInfo;
      } else {
        let modelInfo = models.find((model) => model.model === selectedModel);
        return modelInfo;
      }
    }, [models, selectedModel]);

  const selectedProvider: ModelProviderInfo | undefined = useMemo(() => {
    let isFullName = selectedModel.includes("/");
    if (!isFullName) {
      return undefined;
    }

    if (selectedModelInfo && (selectedModelInfo as ModelInfo)) {
      let providerName = selectedModel.split("/")[0];

      return (selectedModelInfo as ModelInfo).endpoints?.find(
        (endpoint) => endpoint.provider.provider === providerName
      );
    }
    return undefined;
  }, [selectedModelInfo, selectedModel]);

  const isNoProviderConfigured = useMemo(() => {
    let modelInfo = selectedModelInfo as ModelInfo;
    if (!modelInfo) return false;
    if (!modelInfo || modelInfo.endpoints?.length === 0) {
      return true;
    }
    return (
      modelInfo.endpoints?.filter((endpoint) => !endpoint.available).length ===
      modelInfo.endpoints?.length
    );
  }, [selectedModelInfo]);

  const isSelectedProviderConfigured = useMemo(() => {
    // If no provider is selected (simple format), check if any provider is configured
    if (!selectedModel.includes("/")) {
      return !isNoProviderConfigured;
    }

    // If provider is selected (full format), check if that specific provider is configured
    if (selectedProvider) {
      return selectedProvider.available;
    }

    return true;
  }, [selectedModel, selectedProvider, isNoProviderConfigured]);

  const handleWarningClick = useCallback(() => {
    if (!selectedModelInfo || !(selectedModelInfo as ModelInfo)) return;

    const unconfiguredProviders =
      (selectedModelInfo as ModelInfo).endpoints?.filter(
        (ep) => !ep.available
      ) || [];

    // If only one unconfigured provider, open config dialog directly
    if (unconfiguredProviders.length === 1) {
      setSelectedProviderForConfig(unconfiguredProviders[0].provider.provider);
      setConfigDialogOpen?.(true);
    } else if (unconfiguredProviders.length > 1) {
      // If multiple unconfigured providers, show provider list dialog
      setProviderListDialogOpen?.(true);
    }
  }, [selectedModelInfo, setConfigDialogOpen, setProviderListDialogOpen]);

  return {
    selectedModel,
    selectedModelInfo,
    selectedProvider,
    isNoProviderConfigured,
    isSelectedProviderConfigured,
    selectedProviderForConfig,
    setSelectedProviderForConfig,
    providerListDialogOpen,
    setProviderListDialogOpen,
    configDialogOpen,
    setConfigDialogOpen,
    handleWarningClick,
    modelConfig,
    setModelConfig,
  };
};
