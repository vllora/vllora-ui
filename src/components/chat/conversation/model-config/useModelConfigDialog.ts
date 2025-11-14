import { useState, useEffect, useCallback } from "react";
import { ModelInfo } from "@/types/models";
import { detectComplexFeatures, formatJson } from "./utils";
import { toast } from "sonner";
import { VirtualModelsConsumer } from "@/contexts/VirtualModelsContext";
import { VirtualModel } from "@/services/virtual-models-api";

// Type guard to check if the modelInfo is a ModelInfo
function isModelInfo(modelInfo: ModelInfo | VirtualModel): modelInfo is ModelInfo {
  return 'model' in modelInfo && 'model_provider' in modelInfo;
}

interface UseModelConfigDialogProps {
  open: boolean;
  modelInfo: ModelInfo | VirtualModel;
  onConfigChange?: (config: Record<string, any>) => void;
  initialConfig?: Record<string, any>;
  selectedModel?: string;
  onModelChange?: (model: string) => void;
  projectId?: string;
  onOpenChange: (open: boolean) => void;
}

export function useModelConfigDialog({
  open,
  modelInfo,
  onConfigChange,
  initialConfig = {},
  selectedModel,
  onModelChange,
  projectId,
  onOpenChange,
}: UseModelConfigDialogProps) {
  // Get virtual models context
  const { createVirtualModel, creating } = VirtualModelsConsumer();

  // Initialize mode from sessionStorage or default to 'basic'
  const [mode, setMode] = useState<'basic' | 'advanced'>('basic');
  const [config, setConfig] = useState<Record<string, any>>(initialConfig);
  const [jsonContent, setJsonContent] = useState<string>('');
  const [showWarning, setShowWarning] = useState(false);
  const [complexFeatures, setComplexFeatures] = useState<string[]>([]);
  const [pendingJsonToSwitch, setPendingJsonToSwitch] = useState<string>('');
  const [step, setStep] = useState<'config' | 'save'>('config');
  const [virtualModelName, setVirtualModelName] = useState('');
  const [originalBaseModel, setOriginalBaseModel] = useState<string | undefined>(selectedModel);

  // Determine if this is a "create mode" (no onConfigChange means it's for creating virtual models only)
  const isCreateMode = !onConfigChange;

  // Helper: Convert config object to formatted JSON string
  const configToJson = useCallback((configObj: Record<string, any>): string => {
    try {
      let fullConfig = {
        ...configObj,
        mode: selectedModel
      }
      return JSON.stringify(fullConfig, null, 2);
    } catch (error) {
      console.error('Error converting config to JSON:', error);
      return '{}';
    }
  }, [selectedModel]);

  // Helper: Parse JSON string back to config object
  const jsonToConfig = useCallback((jsonStr: string): { success: boolean; config?: Record<string, any>; error?: string } => {
    try {
      const parsed = JSON.parse(jsonStr);
      if (typeof parsed !== 'object' || parsed === null) {
        return { success: false, error: 'Invalid JSON: must be an object' };
      }
      return { success: true, config: parsed };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Invalid JSON' };
    }
  }, []);

  // Initialize config when dialog opens
  useEffect(() => {
    if (open) {
      const defaultConfig: Record<string, any> = {};

      // Handle ModelInfo case
      if (isModelInfo(modelInfo) && modelInfo.parameters) {
        // Restore parameter values
        Object.entries(modelInfo.parameters).forEach(([key, param]) => {
          if (initialConfig[key] !== undefined) {
            defaultConfig[key] = initialConfig[key];
          } else if (param.default !== null) {
            defaultConfig[key] = param.default;
          }
        });
      } else if (!isModelInfo(modelInfo)) {
        // Handle VirtualModel case - use the latest version's target_configuration
        const latestVersion = modelInfo.versions.find(v => v.latest) || modelInfo.versions[0];
        if (latestVersion?.target_configuration) {
          Object.assign(defaultConfig, latestVersion.target_configuration);
        }
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
      setVirtualModelName('');
    }
  }, [open, modelInfo, initialConfig]);

  // Helper: Extract only user-modified config (different from defaults)
  const getUserConfig = useCallback(() => {
    const userConfig: Record<string, any> = {};

    // For ModelInfo: Save parameter configs that differ from defaults
    if (isModelInfo(modelInfo) && modelInfo.parameters) {
      Object.entries(config).forEach(([key, value]) => {
        const param = modelInfo.parameters![key];
        // Only include if value is different from default
        if (param && value !== param.default) {
          userConfig[key] = value;
        }
      });
    } else if (!isModelInfo(modelInfo)) {
      // For VirtualModel: Include all config as there are no "defaults" to compare against
      Object.assign(userConfig, config);
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
  }, [config, modelInfo]);

  const handleSave = useCallback(async () => {
    // If in create mode, create virtual model directly
    if (isCreateMode) {
      if (!virtualModelName.trim()) {
        toast.error('Please enter a name for the virtual model');
        return;
      }

      if (!projectId) {
        toast.error('Project ID is required to save virtual model');
        return;
      }

      try {
        // Get the current configuration
        const configToSave = mode === 'advanced'
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
        console.error('Error saving virtual model:', error);
      }
      return;
    }

    // Original behavior for conversation mode
    let finalConfig: Record<string, any> = {};

    // If in Advanced mode, parse JSON first
    if (mode === 'advanced') {
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
  }, [isCreateMode, virtualModelName, projectId, mode, jsonContent, config, getUserConfig, createVirtualModel, onOpenChange, onConfigChange, jsonToConfig]);

  const handleReset = useCallback(() => {
    const defaultConfig: Record<string, any> = {};

    // For ModelInfo: Reset parameters to defaults
    if (isModelInfo(modelInfo) && modelInfo.parameters) {
      Object.entries(modelInfo.parameters).forEach(([key, param]) => {
        if (param.default !== null) {
          defaultConfig[key] = param.default;
        }
      });
    } else if (!isModelInfo(modelInfo)) {
      // For VirtualModel: Reset to the virtual model's original configuration
      const latestVersion = modelInfo.versions.find(v => v.latest) || modelInfo.versions[0];
      if (latestVersion?.target_configuration) {
        Object.assign(defaultConfig, latestVersion.target_configuration);
      }
    }

    // Cache is disabled by default (extra.cache is not included)
    setConfig(defaultConfig);

    // Clear the saved config since we're resetting to defaults
    onConfigChange?.({});
  }, [modelInfo, onConfigChange]);

  // Handle mode switching
  const handleModeSwitch = useCallback((newMode: 'basic' | 'advanced') => {
    if (newMode === 'advanced') {
      // UI → JSON: Convert current config to JSON, filtering out defaults
      const userConfig = getUserConfig();
      const json = formatJson(configToJson(userConfig));
      setJsonContent(json);
      setMode('advanced');
      // Persist mode to sessionStorage
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('modelConfigDialogMode', 'advanced');
      }
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
  }, [getUserConfig, configToJson, jsonContent, jsonToConfig]);

  // Confirm mode switch after warning
  const confirmModeSwitch = useCallback((configToApply?: Record<string, any>) => {
    const configData = configToApply || (() => {
      const result = jsonToConfig(pendingJsonToSwitch);
      return result.success ? result.config : config;
    })();

    setConfig(configData || config);
    setMode('basic');
    // Persist mode to sessionStorage
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('modelConfigDialogMode', 'basic');
    }
    // Reset pending state
    setPendingJsonToSwitch('');
  }, [pendingJsonToSwitch, config, jsonToConfig]);

  // Handle saving as virtual model
  const handleSaveAsVirtualModel = useCallback(async (data: { name: string }) => {
    if (!projectId) {
      toast.error('Project ID is required to save virtual model');
      return;
    }

    try {
      // Get the current configuration
      const configToSave = mode === 'advanced'
        ? jsonToConfig(jsonContent).config || config
        : getUserConfig();

      // Use context method to save virtual model
      await createVirtualModel({
        name: data.name,
        target_configuration: configToSave,
        is_public: false,
        latest: true,
      });

      // Go back to config step
      setStep('config');

      // Close the dialog
      onOpenChange(false);
    } catch (error) {
      // Error handling is done in the context
      console.error('Error saving virtual model:', error);
    }
  }, [projectId, mode, jsonContent, config, getUserConfig, createVirtualModel, onOpenChange, jsonToConfig]);

  // Handle clearing virtual model (restore original base model)
  const handleClearVirtualModel = useCallback(() => {
    // Remove the virtual model from config
    const { model, ...restConfig } = config;
    setConfig(restConfig);

    // Restore original base model if available
    if (originalBaseModel && onModelChange) {
      onModelChange(originalBaseModel);
    }
  }, [config, originalBaseModel, onModelChange]);

  // Handle applying virtual model configuration
  const handleApplyVirtualModel = useCallback((virtualModel: VirtualModel, applyMode: 'base' | 'copy') => {
    const latestVersion = virtualModel.versions.find(v => v.latest);
    const targetConfig = latestVersion?.target_configuration || virtualModel.versions[0]?.target_configuration;

    if (!targetConfig) {
      toast.error('Virtual model configuration not found');
      return;
    }

    // Check if config has complex features that require advanced mode
    const complexFeatures = detectComplexFeatures(targetConfig);
    const hasComplexFeatures = complexFeatures.length > 0;

    if (applyMode === 'copy') {
      // Copy mode: Replace current config with virtual model config
      setConfig(targetConfig);
      let modelFromTargetConfig = targetConfig.model;

      if (modelFromTargetConfig && typeof modelFromTargetConfig === 'string' && onModelChange) {
        onModelChange(modelFromTargetConfig);
      }

      // If config has complex features and we're in basic mode, switch to advanced
      if (hasComplexFeatures && mode === 'basic') {
        const json = formatJson(configToJson(targetConfig));
        setJsonContent(json);
        setMode('advanced');
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('modelConfigDialogMode', 'advanced');
        }
        toast.success(
          `Copied configuration from "${virtualModel.name}" and switched to Advanced mode (config contains complex features)`
        );
      } else if (mode === 'advanced') {
        const json = formatJson(configToJson(targetConfig));
        setJsonContent(json);
        toast.success(`Copied configuration from "${virtualModel.name}"`);
      } else {
        toast.success(`Copied configuration from "${virtualModel.name}"`);
      }
    } else {
      // Base mode: Use virtual model as the base model
      // User's current form configuration is preserved and applied on top
      // Save the current base model before applying virtual model
      if (!config.model || !config.model.startsWith('langdb/')) {
        setOriginalBaseModel(selectedModel);
      }

      const virtualModelIdentifier = `langdb/${virtualModel.slug}`;
      const mergedConfig = {
        ...config,
        model: virtualModelIdentifier
      };
      // Update the selected model in the UI to show the virtual model
      //onModelChange?.(virtualModelIdentifier);
      setConfig(mergedConfig);

      // If merged config has complex features and we're in basic mode, switch to advanced
      const mergedComplexFeatures = detectComplexFeatures(mergedConfig);
      const hasMergedComplexFeatures = mergedComplexFeatures.length > 0;

      if (hasMergedComplexFeatures && mode === 'basic') {
        const json = formatJson(configToJson(mergedConfig));
        setJsonContent(json);
        setMode('advanced');
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('modelConfigDialogMode', 'advanced');
        }
        toast.success(
          `Using "${virtualModel.name}" as base and switched to Advanced mode (config contains complex features)`
        );
      } else if (mode === 'advanced') {
        const json = formatJson(configToJson(mergedConfig));
        setJsonContent(json);
        toast.success(`Using "${virtualModel.name}" as base configuration`);
      } else {
        toast.success(`Using "${virtualModel.name}" as base configuration`);
      }
    }
  }, [config, mode, onModelChange, configToJson]);

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
    creating,
    originalBaseModel,

    // Setters
    setMode,
    setConfig,
    setJsonContent,
    setShowWarning,
    setStep,
    setVirtualModelName,

    // Handlers
    handleSave,
    handleReset,
    handleModeSwitch,
    confirmModeSwitch,
    handleSaveAsVirtualModel,
    handleApplyVirtualModel,
    handleClearVirtualModel,
  };
}
