import { useState, useEffect, useRef } from "react";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { ModelInfo } from "@/types/models";
import { ConfigStep } from "./config-step";
import { SaveStep } from "./save-step";
import { ModeSwitchWarning } from "./mode-switch-warning";
import { SaveVirtualModelFormRef } from "./save-virtual-model-form";
import { detectComplexFeatures, formatJson } from "./utils";
import { toast } from "sonner";
import { VirtualModelsConsumer } from "@/contexts/VirtualModelsContext";

interface ModelConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modelInfo: ModelInfo;
  onConfigChange?: (config: Record<string, any>) => void;
  initialConfig?: Record<string, any>;
  selectedModel?: string;
  onModelChange?: (model: string) => void;
  projectId?: string;
}

export function ModelConfigDialog({
  open,
  onOpenChange,
  modelInfo,
  onConfigChange,
  initialConfig = {},
  selectedModel,
  onModelChange,
  projectId,
}: ModelConfigDialogProps) {
  // Get virtual models context
  const { createVirtualModel, creating } = VirtualModelsConsumer();

  // Initialize mode from sessionStorage or default to 'basic'
  const [mode, setMode] = useState<'basic' | 'advanced'>(() => {
    if (typeof window !== 'undefined') {
      const savedMode = sessionStorage.getItem('modelConfigDialogMode');
      return (savedMode === 'basic' || savedMode === 'advanced') ? savedMode : 'basic';
    }
    return 'basic';
  });
  const [config, setConfig] = useState<Record<string, any>>(initialConfig);
  const [jsonContent, setJsonContent] = useState<string>('');
  const [showWarning, setShowWarning] = useState(false);
  const [complexFeatures, setComplexFeatures] = useState<string[]>([]);
  const [pendingJsonToSwitch, setPendingJsonToSwitch] = useState<string>('');
  const [step, setStep] = useState<'config' | 'save'>('config');
  const saveFormRef = useRef<SaveVirtualModelFormRef>(null);

  // Helper: Convert config object to formatted JSON string
  const configToJson = (configObj: Record<string, any>): string => {
    try {
      return JSON.stringify(configObj, null, 2);
    } catch (error) {
      console.error('Error converting config to JSON:', error);
      return '{}';
    }
  };

  // Helper: Parse JSON string back to config object
  const jsonToConfig = (jsonStr: string): { success: boolean; config?: Record<string, any>; error?: string } => {
    try {
      const parsed = JSON.parse(jsonStr);
      if (typeof parsed !== 'object' || parsed === null) {
        return { success: false, error: 'Invalid JSON: must be an object' };
      }
      return { success: true, config: parsed };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Invalid JSON' };
    }
  };

  useEffect(() => {
    // Initialize config with defaults when dialog opens
    if (open && modelInfo.parameters) {
      const defaultConfig: Record<string, any> = {};

      // Restore parameter values
      Object.entries(modelInfo.parameters).forEach(([key, param]) => {
        if (initialConfig[key] !== undefined) {
          defaultConfig[key] = initialConfig[key];
        } else if (param.default !== null) {
          defaultConfig[key] = param.default;
        }
      });

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

      setConfig(defaultConfig);
    }
  }, [open, modelInfo.parameters, initialConfig]);

  const handleSave = () => {
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
      const userConfig: Record<string, any> = {};

      // Save parameter configs that differ from defaults
      if (modelInfo.parameters) {
        Object.entries(config).forEach(([key, value]) => {
          const param = modelInfo.parameters![key];
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

      finalConfig = userConfig;
    }

    onConfigChange?.(finalConfig);
    onOpenChange(false);
  };

  const handleReset = () => {
    const defaultConfig: Record<string, any> = {};

    // Reset parameters to defaults
    if (modelInfo.parameters) {
      Object.entries(modelInfo.parameters).forEach(([key, param]) => {
        if (param.default !== null) {
          defaultConfig[key] = param.default;
        }
      });
    }

    // Cache is disabled by default (extra.cache is not included)
    setConfig(defaultConfig);

    // Clear the saved config since we're resetting to defaults
    onConfigChange?.({});
  };

  // Handle mode switching
  const handleModeSwitch = (newMode: 'basic' | 'advanced') => {
    if (newMode === 'advanced') {
      // UI → JSON: Convert current config to JSON with formatting
      const json = formatJson(configToJson(config));
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
  };

  // Confirm mode switch after warning
  const confirmModeSwitch = (configToApply?: Record<string, any>) => {
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
  };

  // Handle saving as virtual model
  const handleSaveAsVirtualModel = async (data: { name: string }) => {
    if (!projectId) {
      toast.error('Project ID is required to save virtual model');
      return;
    }

    try {
      // Get the current configuration
      const configToSave = mode === 'advanced'
        ? jsonToConfig(jsonContent).config || config
        : config;

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
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[60vw] h-[80vh] overflow-hidden flex flex-col">
        {step === 'config' ? (
          <ConfigStep
            mode={mode}
            onModeChange={handleModeSwitch}
            selectedModel={selectedModel}
            onModelChange={onModelChange}
            config={config}
            onConfigChange={setConfig}
            modelInfo={modelInfo}
            jsonContent={jsonContent}
            onJsonContentChange={setJsonContent}
            onReset={handleReset}
            onSave={handleSave}
            onSaveAsVirtualModel={() => setStep('save')}
          />
        ) : (
          <SaveStep
            ref={saveFormRef}
            onSave={handleSaveAsVirtualModel}
            onBack={() => setStep('config')}
            isSaving={creating}
          />
        )}
      </DialogContent>

      {/* Mode Switch Warning Dialog */}
      <ModeSwitchWarning
        open={showWarning}
        onOpenChange={setShowWarning}
        onConfirm={() => confirmModeSwitch()}
        complexFeatures={complexFeatures}
      />
    </Dialog>
  );
}
