/**
 * Utility functions for Model Configuration
 */

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

  // Check for advanced cache configuration beyond simple enable/disable
  if (config.extra?.cache && typeof config.extra.cache === 'object') {
    const cacheKeys = Object.keys(config.extra.cache);
    if (cacheKeys.length > 1 || !cacheKeys.includes('enabled')) {
      complexFeatures.push("Advanced Cache Configuration");
    }
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
