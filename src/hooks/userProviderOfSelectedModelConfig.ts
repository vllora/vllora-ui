import { ProjectModelsConsumer } from "@/contexts/ProjectModelsContext";
import { ModelInfo, ModelProviderInfo } from "@/types/models";
import { useCallback, useMemo, useState } from "react";

export const useUserProviderOfSelectedModelConfig = (props: {
  selectedModel: string;
}) => {
  const { selectedModel } = props;
  const { models } = ProjectModelsConsumer();
  const [selectedProviderForConfig, setSelectedProviderForConfig] = useState<
    string | undefined
  >(undefined);
  const [providerListDialogOpen, setProviderListDialogOpen] = useState(false);
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const selectedModelInfo: ModelInfo | undefined = useMemo(() => {
    let isFullName = selectedModel.includes("/");
    if (isFullName) {
      let splited = selectedModel.split("/");
      let modelName = splited[1];
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

    if (selectedModelInfo) {
      let providerName = selectedModel.split("/")[0];

      return selectedModelInfo.endpoints?.find(
        (endpoint) => endpoint.provider.provider === providerName
      );
    }
    return undefined;
  }, [selectedModelInfo, selectedModel]);

  const isNoProviderConfigured = useMemo(() => {
    if (!selectedModelInfo || selectedModelInfo.endpoints?.length === 0) {
      return true;
    }
    return (
      selectedModelInfo.endpoints?.filter((endpoint) => !endpoint.available)
        .length === selectedModelInfo.endpoints?.length
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
    if (!selectedModelInfo) return;
    
    const unconfiguredProviders = selectedModelInfo.endpoints?.filter(ep => !ep.available) || [];

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
  };
};
