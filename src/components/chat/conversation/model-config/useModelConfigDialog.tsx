import {
  useState,
  useEffect,
  useCallback,
  createContext,
  useContext,
  useMemo,
  ReactNode,
} from "react";
import { ModelInfo } from "@/types/models";
import {
  detectComplexFeatures,
  formatJson,
  getModelInfoFromConfig,
} from "./utils";
import { toast } from "sonner";
import { VirtualModelsConsumer } from "@/contexts/VirtualModelsContext";
import { VirtualModel } from "@/services/virtual-models-api";
import { ProjectModelsConsumer } from "@/lib";

// Type guard to check if the modelInfo is a ModelInfo
function isModelInfo(
  modelInfo: ModelInfo | VirtualModel
): modelInfo is ModelInfo {
  return "model" in modelInfo && "model_provider" in modelInfo;
}

export type ModelConfigDialogContextType = ReturnType<
  typeof useModelConfigDialog
>;

const UI_PROPERTIES_CONFIG = ['messages', 'max_retries', 'fallback', 'extra', 'model', 'cache']


const ModelConfigDialogContext = createContext<
  ModelConfigDialogContextType | undefined
>(undefined);

function useModelConfigDialog({
  open,
  onConfigChange,
  initialConfig = {},
  projectId,
  onOpenChange,
  modified_mode,
  virtualModelSlug,
  selectedVersion,
  onVersionChange,
}: {
  open: boolean;
  onConfigChange?: (config: Record<string, any>) => void;
  initialConfig?: Record<string, any>;
  projectId?: string;
  onOpenChange: (open: boolean) => void;
  modified_mode: 'model_config' | 'create' | 'edit',
  virtualModelSlug?: string,
  selectedVersion?: number,
  onVersionChange?: (version: number) => void,
}) {
  // Get virtual models context
  const { createVirtualModel, updateVirtualModel, updateVersion, updateVersionMeta, creating, updating, updatingVersion, updatingVersionMeta, virtualModels } =
    VirtualModelsConsumer();
  const { models } = ProjectModelsConsumer();

  const intialModelInfo = useMemo(() => {
    return getModelInfoFromConfig({
      config: initialConfig,
      availableModels: models,
      availableVirtualModels: virtualModels,
    });
  }, [models, virtualModels, initialConfig]);

  

  // Initialize mode from sessionStorage or default to 'basic'
  const [mode, setMode] = useState<"basic" | "advanced">("basic");
  const [config, setConfig] = useState<Record<string, any>>(initialConfig);
  const [jsonContent, setJsonContent] = useState<string>("");
  const [showWarning, setShowWarning] = useState(false);
  const [complexFeatures, setComplexFeatures] = useState<string[]>([]);
  const [pendingJsonToSwitch, setPendingJsonToSwitch] = useState<string>("");
  const [step, setStep] = useState<"config" | "save">("config");
  const [virtualModelName, setVirtualModelName] = useState("");
  // Determine if this is a "create mode" (no onConfigChange means it's for creating virtual models only)
  const isCreateMode = !onConfigChange;
   const currentModelInfo = useMemo(() => {
    return getModelInfoFromConfig({
      config,
      availableModels: models,
      availableVirtualModels: virtualModels,
    });
  }, [models, virtualModels, config?.model]);
  // Compute the original base model - either from config or from modelInfo
  // const originalBaseModel = initialConfig.model;

  // Helper: Convert config object to formatted JSON string
  const configToJson = useCallback((configObj: Record<string, any>): string => {
    try {
      const { model, ...cleanConfig } = configObj;
      return JSON.stringify(cleanConfig, null, 2);
    } catch (error) {
      console.error("Error converting config to JSON:", error);
      return "{}";
    }
  }, []);

  // Helper: Parse JSON string back to config object
  const jsonToConfig = useCallback(
    (
      jsonStr: string
    ): { success: boolean; config?: Record<string, any>; error?: string } => {
      try {
        const parsed = JSON.parse(jsonStr);
        if (typeof parsed !== "object" || parsed === null) {
          return { success: false, error: "Invalid JSON: must be an object" };
        }
        return { success: true, config: parsed };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Invalid JSON",
        };
      }
    },
    []
  );

  // Initialize config when dialog opens
  useEffect(() => {
    if (open) {
      const defaultConfig: Record<string, any> = {};

      // Handle ModelInfo case
      if (intialModelInfo && (intialModelInfo as ModelInfo)) {
        let baseModelInfo: ModelInfo = intialModelInfo as ModelInfo;
        // Restore parameter values
        baseModelInfo?.parameters &&
          Object.entries(baseModelInfo.parameters).forEach(([key, param]) => {
            if (initialConfig[key] !== undefined) {
              defaultConfig[key] = initialConfig[key];
            } else if (param.default !== null) {
              defaultConfig[key] = param.default;
            }
          });
      }
      // Restore extra field (contains cache config)
      if (initialConfig.extra !== undefined) {
        defaultConfig.extra = initialConfig.extra;
      }

      // Restore fallback
      if (initialConfig.fallback !== undefined) {
        defaultConfig.fallback = initialConfig.fallback;
      }

      // Restore max_retries
      if (initialConfig.max_retries !== undefined) {
        defaultConfig.max_retries = initialConfig.max_retries;
      }

      // Restore messages
      if (initialConfig.messages !== undefined) {
        defaultConfig.messages = initialConfig.messages;
      }

      // Restore model field if it exists (for virtual models used as base)
      if (initialConfig.model !== undefined) {
        defaultConfig.model = initialConfig.model;
      }
      setConfig(defaultConfig);
    }

    // Reset virtual model name when dialog closes
    if (!open) {
      setVirtualModelName("");
    }
  }, [open, initialConfig, intialModelInfo]);

  // Initialize virtual model name when in edit mode (separate effect to avoid re-running config initialization)
  useEffect(() => {
    if (open && modified_mode === 'edit' && virtualModelSlug) {
      const virtualModel = virtualModels.find((vm) => vm.slug === virtualModelSlug);
      if (virtualModel) {
        setVirtualModelName(virtualModel.name);
      }
    }
  }, [open, modified_mode, virtualModelSlug, virtualModels]);

  // Helper: Extract only user-modified config (different from defaults)
  const getUserConfig = useCallback(() => {
    const userConfig: Record<string, any> = {};

    if (
      currentModelInfo &&
      isModelInfo(currentModelInfo) &&
      currentModelInfo.parameters
    ) {
      Object.entries(config).forEach(([key, value]) => {
        const param = currentModelInfo.parameters![key];
        // Only include if value is different from default
        if (param && value !== param.default) {
          userConfig[key] = value;
        }
      });
    }
    // Always include extra field if it exists (contains cache config)
    if (config.extra !== undefined) {
      userConfig.extra = config.extra;
    }

    // Include fallback if it exists
    if (config.fallback !== undefined) {
      userConfig.fallback = config.fallback;
    }

    // Include max_retries if it exists
    if (config.max_retries !== undefined) {
      userConfig.max_retries = config.max_retries;
    }

    // Include messages if they exist
    if (config.messages && config.messages.length > 0) {
      userConfig.messages = config.messages;
    }
    // Include model if it exists (for virtual models used as base)
    if (config.model !== undefined) {
      userConfig.model = config.model;
    }
    return userConfig;
  }, [config, currentModelInfo]);

  const handleDoneBtn = useCallback(async () => {
    // If in create mode, create virtual model directly
    if (isCreateMode) {
      if (!virtualModelName.trim()) {
        toast.error("Please enter a name for the virtual model");
        return;
      }

      if (!projectId) {
        toast.error("Project ID is required to save virtual model");
        return;
      }

      try {
        // Get the current configuration
        const configToSave =
          mode === "advanced"
            ? jsonToConfig(jsonContent).config || config
            : getUserConfig();

        // Use context method to save virtual model
        await createVirtualModel({
          name: virtualModelName.trim(),
          target_configuration: configToSave,
          is_public: false,
          latest: true,
        });

        // Close the dialog
        onOpenChange(false);
      } catch (error) {
        // Error handling is done in the context
        console.error("Error saving virtual model:", error);
      }
      return;
    }

    // Original behavior for conversation mode
    let finalConfig: Record<string, any> = {};

    // If in Advanced mode, parse JSON first
    if (mode === "advanced") {
      const result = jsonToConfig(jsonContent);
      if (result.success && result.config) {
        finalConfig = result.config;
      } else {
        // Don't save if JSON is invalid
        return;
      }
    } else {
      // Only save values that differ from defaults in Basic mode
      finalConfig = getUserConfig();
    }

    onConfigChange?.(finalConfig);
    onOpenChange(false);
    setStep("config");
    setMode("basic");
    setJsonContent("");
    setConfig({});
  }, [
    isCreateMode,
    virtualModelName,
    projectId,
    mode,
    jsonContent,
    config,
    getUserConfig,
    createVirtualModel,
    onOpenChange,
    onConfigChange,
    jsonToConfig,
  ]);

  const handleReset = useCallback(() => {
    const defaultConfig: Record<string, any> = {};

    // For ModelInfo: Reset parameters to defaults
    if (
      intialModelInfo &&
      isModelInfo(intialModelInfo) &&
      intialModelInfo.parameters
    ) {
      Object.entries(intialModelInfo.parameters).forEach(([key, param]) => {
        if (param.default !== null) {
          defaultConfig[key] = param.default;
        }
      });
    }

    // Cache is disabled by default (extra.cache is not included)
    setConfig({
      ...defaultConfig,
      model: initialConfig.model,
    });
  }, [initialConfig]);

  // Handle mode switching
  const handleModeSwitch = useCallback(
    (newMode: "basic" | "advanced") => {
      if (newMode === "advanced") {
        // UI → JSON: Convert current config to JSON, filtering out defaults
        const userConfig = getUserConfig();
        if(userConfig.messages && userConfig.messages.length > 0){
          userConfig.messages = userConfig.messages.map((message: any) => {
            return {
              role: message.role,
              content: message.content,
            };
          });
        }
        const json = JSON.stringify(userConfig, null, 2)
        setJsonContent(json);
        setMode("advanced");
       
      } else {
        // JSON → UI: Check for complex features first
        const result = jsonToConfig(jsonContent);
        if (result.success && result.config) {
          const detected = detectComplexFeatures(result.config);

          if (detected.length > 0) {
            // Show warning dialog
            setComplexFeatures(detected);
            setPendingJsonToSwitch(jsonContent);
            setShowWarning(true);
          } else {
            // Safe to switch directly
            confirmModeSwitch(result.config);
          }
        }
      }
    },
    [getUserConfig, configToJson, jsonContent, jsonToConfig, config]
  );

  // Confirm mode switch after warning
  const confirmModeSwitch = useCallback(
    (configToApply?: Record<string, any>) => {
      const configData =
        configToApply ||
        (() => {
          const result = jsonToConfig(pendingJsonToSwitch);
          return result.success ? result.config : config;
        })();

      setConfig(configData || config);
      setMode("basic");
     
      // Reset pending state
      setPendingJsonToSwitch("");
    },
    [pendingJsonToSwitch, config, jsonToConfig]
  );

  // Handle saving as virtual model
  const handleSaveAsVirtualModel = useCallback(
    async (data: { name: string; forceCreateNewVersion?: boolean }) => {
      if (!projectId) {
        toast.error("Project ID is required to save virtual model");
        return;
      }

      try {
        // Get the current configuration
        const configToSave =
          mode === "advanced"
            ? jsonToConfig(jsonContent).config || config
            : getUserConfig();

        let virtualModelResult: any;

        if (modified_mode === 'edit' && virtualModelSlug) {
          // Update existing virtual model
          const virtualModel = virtualModels.find((vm) => vm.slug === virtualModelSlug);
          if (!virtualModel) {
            toast.error("Virtual model not found");
            return;
          }

          // Check if we're updating a specific version
          if (selectedVersion !== undefined) {
            // If version is published or forceCreateNewVersion is true, create a new version instead
            if (data.forceCreateNewVersion) {
              virtualModelResult = await updateVirtualModel({
                virtualModelId: virtualModel.id,
                name: data.name,
                target_configuration: configToSave,
                is_public: false,
                latest: true,
              });
              toast.success("Created new version for published configuration");
            } else {
              // Update specific version (without changing latest flag)
              virtualModelResult = await updateVersion({
                virtualModelId: virtualModel.id,
                version: selectedVersion,
                target_configuration: configToSave,
                is_published: true,
              });
            }
          } else {
            // Update virtual model (creates new version)
            virtualModelResult = await updateVirtualModel({
              virtualModelId: virtualModel.id,
              name: data.name,
              target_configuration: configToSave,
              is_public: false,
              latest: true,
            });
          }
        } else {
          // Create new virtual model
          // If creating from conversation mode, automatically publish version 1
          const shouldPublish = modified_mode === 'model_config';

          virtualModelResult = await createVirtualModel({
            name: data.name,
            target_configuration: configToSave,
            is_public: false,
            latest: true,
            is_published: shouldPublish, // Auto-publish if from conversation mode
          });

          if (shouldPublish) {
            toast.success("Virtual model created and published successfully");
          } else {
            toast.success("Virtual model created successfully");
          }
        }

        // Go back to config step
        setStep("config");
        let newConfig = {
          model: `langdb/${virtualModelResult.slug}`,
        }
        setConfig(newConfig);
        setJsonContent(JSON.stringify(newConfig, null, 2));
        setMode("basic");
      } catch (error) {
        // Error handling is done in the context
        console.error("Error saving virtual model:", error);
      }
    },
    [
      projectId,
      mode,
      jsonContent,
      config,
      getUserConfig,
      createVirtualModel,
      updateVirtualModel,
      updateVersion,
      updateVersionMeta,
      virtualModels,
      virtualModelSlug,
      modified_mode,
      selectedVersion,
      onOpenChange,
      jsonToConfig,
    ]
  );

  // Handle clearing virtual model (restore original base model)
  const handleClearVirtualModel = useCallback(() => {
    // Remove the virtual model and restore original base model if available
    setConfig((prev) => {
      const preservedConfig: Record<string, any> = { model: 'openai/gpt-4o-mini' };
      UI_PROPERTIES_CONFIG.forEach((property) => {
        if(prev[property]){
          preservedConfig[property] = prev[property];
        }
      });
      return {
        ...preservedConfig,
        model: 'openai/gpt-4o-mini',
      };
    });
  }, []);

  // Helper: Apply virtual model in copy mode
  const applyVirtualModelCopyMode = useCallback(
    (virtualModel: VirtualModel, targetConfig: Record<string, any>) => {
      // Copy mode: Replace current config with virtual model config
      setConfig(targetConfig);

      // Check if config has complex features that require advanced mode
      const complexFeatures = detectComplexFeatures(targetConfig);
      const hasComplexFeatures = complexFeatures.length > 0;

      if (hasComplexFeatures && mode === "basic") {
        // Switch to advanced mode for complex features
        const json = formatJson(configToJson(targetConfig));
        setJsonContent(json);
        setMode("advanced");
        toast.success(
          `Copied configuration from "${virtualModel.name}" and switched to Advanced mode (config contains complex features)`
        );
      } else if (mode === "advanced") {
        // Already in advanced mode, just update JSON
        const json = formatJson(configToJson(targetConfig));
        setJsonContent(json);
        toast.success(`Copied configuration from "${virtualModel.name}"`);
      } else {
        // Basic mode, no complex features
        toast.success(`Copied configuration from "${virtualModel.name}"`);
      }
    },
    [mode, configToJson]
  );

  // Helper: Apply virtual model in base mode
  const applyVirtualModelBaseMode = useCallback(
    (virtualModel: VirtualModel) => {
      // Base mode: Use virtual model as the base model
      // User's current form configuration is preserved and applied on top
      const virtualModelIdentifier = `langdb/${virtualModel.slug}`;

      const mergedConfig = {
        ...config,
        model: virtualModelIdentifier,
      };

      setConfig(mergedConfig);

      // Check if merged config has complex features
      const mergedComplexFeatures = detectComplexFeatures(mergedConfig);
      const hasMergedComplexFeatures = mergedComplexFeatures.length > 0;

      if (hasMergedComplexFeatures && mode === "basic") {
        // Switch to advanced mode for complex features
        const json = formatJson(configToJson(mergedConfig));
        setJsonContent(json);
        setMode("advanced");
        toast.success(
          `Using "${virtualModel.name}" as base and switched to Advanced mode (config contains complex features)`
        );
      } else if (mode === "advanced") {
        // Already in advanced mode, just update JSON
        const json = formatJson(configToJson(mergedConfig));
        setJsonContent(json);
        toast.success(`Using "${virtualModel.name}" as base configuration`);
      } else {
        // Basic mode, no complex features
        toast.success(`Using "${virtualModel.name}" as base configuration`);
      }
    },
    [config, mode, configToJson]
  );

  // Handle applying virtual model configuration
  const handleApplyVirtualModel = useCallback(
    (virtualModel: VirtualModel, applyMode: "base" | "copy") => {
      // Get the latest version or fallback to first version
      const latestVersion = virtualModel.versions.find((v) => v.latest);
      const targetConfig =
        latestVersion?.target_configuration ||
        virtualModel.versions[0]?.target_configuration;

      if (!targetConfig) {
        toast.error("Virtual model configuration not found");
        return;
      }

      // Delegate to appropriate handler based on mode
      if (applyMode === "copy") {
        applyVirtualModelCopyMode(virtualModel, targetConfig);
      } else {
        applyVirtualModelBaseMode(virtualModel);
      }
    },
    [applyVirtualModelCopyMode, applyVirtualModelBaseMode]
  );

  return {
    // State
    mode,
    config,
    jsonContent,
    showWarning,
    complexFeatures,
    step,
    virtualModelName,
    isCreateMode,
    creating: creating || updating || updatingVersion || updatingVersionMeta, // Combined loading state for all operations
    initialConfig,
    currentModelInfo,
    selectedVersion,
    // Setters
    setMode,
    setConfig,
    setJsonContent,
    setShowWarning,
    setStep,
    setVirtualModelName,

    // Handlers
    handleDoneBtn,
    handleReset,
    handleModeSwitch,
    confirmModeSwitch,
    handleSaveAsVirtualModel,
    handleApplyVirtualModel,
    handleClearVirtualModel,


    // Props
    modified_mode,
    virtualModelSlug,
    onOpenChange,
    onVersionChange,

  };
}

export function ModelConfigDialogProvider({
  children,
  open,
  onConfigChange,
  initialConfig,
  projectId,
  onOpenChange,
  modified_mode,
  virtualModelSlug,
  selectedVersion,
  onVersionChange,
}: {
  children: ReactNode;
  open: boolean;
  onConfigChange?: (config: Record<string, any>) => void;
  initialConfig?: Record<string, any>;
  projectId?: string;
  onOpenChange: (open: boolean) => void;
  modified_mode: 'model_config' | 'create' | 'edit',
  virtualModelSlug?: string,
  selectedVersion?: number,
  onVersionChange?: (version: number) => void,
}) {
  const value = useModelConfigDialog({
    open,
    onConfigChange,
    initialConfig,
    projectId,
    onOpenChange,
    modified_mode,
    virtualModelSlug,
    selectedVersion,
    onVersionChange,
  });
  return (
    <ModelConfigDialogContext.Provider value={value}>
      {children}
    </ModelConfigDialogContext.Provider>)
}
export function ModelConfigDialogConsumer() {
  const context = useContext(ModelConfigDialogContext);
  if (context === undefined) {
    throw new Error(
      "ModelConfigDialogConsumer must be used within a ModelConfigDialogProvider"
    );
  }
  return context;
}
