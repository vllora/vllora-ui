/**
 * Utility functions for Model Configuration
 */

import { ModelInfo, VirtualModel, VirtualModelVersion } from "@/lib";

/**
 * Detects complex features in a configuration object that may not be
 * fully supported in Basic mode
 */
export function detectComplexFeatures(config: Record<string, any>): string[] {
  const complexFeatures: string[] = [];

  // Check for router configuration
  if (config.router || config.routing) {
    complexFeatures.push("Router Configuration");
  }

  // Check for multi-target support
  if (config.targets && Array.isArray(config.targets) && config.targets.length > 1) {
    complexFeatures.push("Multi-Target Support");
  }

  // Check for advanced routing rules
  if (config.routingRules || config.routing_rules) {
    complexFeatures.push("Advanced Routing Rules");
  }

  // Check for custom variables configuration
  if (config.variables && Array.isArray(config.variables)) {
    const hasComplexVariables = config.variables.some(
      (v: any) => v.type && !['string', 'number', 'boolean'].includes(v.type)
    );
    if (hasComplexVariables) {
      complexFeatures.push("Complex Variable Types (array, object)");
    }
  }

  // Check for custom headers or metadata
  if (config.headers || config.metadata) {
    complexFeatures.push("Custom Headers/Metadata");
  }
  // Check for nested or complex message structures
  if (config.messages && Array.isArray(config.messages)) {
    const hasComplexMessages = config.messages.some(
      (msg: any) => typeof msg !== 'object' || !msg.role || !msg.content || Object.keys(msg).length > 3
    );
    if (hasComplexMessages) {
      complexFeatures.push("Complex Message Structures");
    }
  }

  return complexFeatures;
}

/**
 * Format JSON string with proper indentation
 */
export function formatJson(jsonStr: string): string {
  try {
    const parsed = JSON.parse(jsonStr);
    return JSON.stringify(parsed, null, 2);
  } catch (error) {
    // If parsing fails, return original string
    return jsonStr;
  }
}

/**
 * Validate if a string is valid JSON
 */
export function isValidJson(jsonStr: string): boolean {
  try {
    JSON.parse(jsonStr);
    return true;
  } catch {
    return false;
  }
}


export function getModelInfoFromConfig(props:{config: Record<string, any>, availableModels: ModelInfo[], availableVirtualModels: VirtualModel[] }): ModelInfo | VirtualModel | undefined {
  const {config, availableModels, availableVirtualModels} = props;
  if (config.model && typeof config.model === 'string') {
    return getModelInfoFromString({modelStr: config.model, availableModels, availableVirtualModels})
  }
  return undefined
}

export function getModelInfoFromString(props:{modelStr: string, availableModels: ModelInfo[], availableVirtualModels: VirtualModel[] }): ModelInfo | VirtualModel | undefined {
  const {modelStr, availableModels, availableVirtualModels} = props;
  if (modelStr && modelStr.startsWith('langdb/')) {
    const modelSlug = modelStr.split('/')[1];
    const virtualModel = availableVirtualModels.find((model) => model.slug === modelSlug);
    if (virtualModel) {
      return virtualModel;
    }
  }
  if (modelStr) {
    if(modelStr.includes('/')) {
      const splited = modelStr.split('/');
      const modelProvider = splited[0];
      const modelName = splited[1];
      const modelInfo = availableModels.find((model) => model.model === modelName && model.model_provider === modelProvider);
      if (modelInfo) {
        return modelInfo;
      }
    }
    const modelInfo = availableModels.find((m) => m.model === modelStr);
    if (modelInfo) {
      return modelInfo;
    }
  }
  return undefined
}
  


export const getValidVersion = (virtualModel: VirtualModel): VirtualModelVersion | undefined => {
  const latestAndPublished = virtualModel.versions.find((v) => v.latest && v.published_at);
  if(latestAndPublished) {
    return latestAndPublished;
  }
  const publishVersion = virtualModel.versions.find((v) => v.published_at);
  if(publishVersion) {
    return publishVersion;
  }
  if(virtualModel.versions.length > 0) {
    return virtualModel.versions[0];
  }
  return undefined;
}