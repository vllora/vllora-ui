/**
 * Utility functions for detecting and mapping model capabilities to icons
 */

import { 
  FunctionSquare, 
  Braces, 
  Brain, 
  Eye,
  Zap,
  DollarSign
} from 'lucide-react';

export interface Capability {
  icon: React.ComponentType<any>;
  label: string;
  description: string;
  className?: string;
}

/**
 * Detect if model supports function calling/tools
 */
export const detectFunctionCalling = (capabilities?: string[]): boolean => {
  if (!capabilities) return false;
  
  return capabilities.includes('tools');
};

/**
 * Detect if model supports structured outputs/JSON mode
 */
export const detectStructuredOutput = (parameters?: any): boolean => {
  if (!parameters) return false;
  
  // Check if structured_outputs parameter exists (it's an object in the API)
  return parameters?.structured_outputs !== undefined;
};

/**
 * Detect if model supports reasoning
 */
export const detectReasoning = (capabilities?: string[]): boolean => {
  if (!capabilities) return false;
  
  return capabilities.includes('reasoning');
};

/**
 * Detect if model supports vision
 */
export const detectVision = (capabilities?: string[], inputFormats?: string[]): boolean => {
  if (!capabilities) return false;
  
  // Direct check for vision capability
  if (capabilities.includes('vision')) {
    return true;
  }
  
  // Also check if image formats are in input (vision implies image input capability)
  const hasImageInput = inputFormats?.some(format => 
    format.toLowerCase().includes('image')
  );
  
  return hasImageInput || false;
};

/**
 * Get all detected capabilities for a model
 */
export const getModelCapabilities = (
  capabilities?: string[],
  inputFormats?: string[],
  outputFormats?: string[],
  parameters?: any
): Capability[] => {
  const detectedCapabilities: Capability[] = [];

  if (detectFunctionCalling(capabilities)) {
    detectedCapabilities.push({
      icon: FunctionSquare,
      label: 'Function Calling',
      description: 'Supports function calling and tool usage',
      className: 'text-blue-400'
    });
  }

  if (detectStructuredOutput(parameters)) {
    detectedCapabilities.push({
      icon: Braces,
      label: 'Structured Output',
      description: 'Supports JSON mode and structured outputs',
      className: 'text-green-400'
    });
  }

  if (detectReasoning(capabilities)) {
    detectedCapabilities.push({
      icon: Brain,
      label: 'Reasoning',
      description: 'Advanced reasoning and analysis capabilities',
      className: 'text-yellow-400'
    });
  }

  if (detectVision(capabilities, inputFormats)) {
    detectedCapabilities.push({
      icon: Eye,
      label: 'Vision',
      description: 'Image understanding and multimodal capabilities',
      className: 'text-purple-400'
    });
  }

  return detectedCapabilities;
};

/**
 * Get capability icon and info by name
 */
export const getCapabilityInfo = (capabilityName: string): Capability | null => {
  const capabilities: Record<string, Capability> = {
    'function_calling': {
      icon: FunctionSquare,
      label: 'Function Calling',
      description: 'Supports function calling and tool usage',
      className: 'text-blue-400'
    },
    'structured_output': {
      icon: Braces,
      label: 'Structured Output',
      description: 'Supports JSON mode and structured outputs',
      className: 'text-green-400'
    },
    'reasoning': {
      icon: Brain,
      label: 'Reasoning',
      description: 'Advanced reasoning and analysis capabilities',
      className: 'text-yellow-400'
    },
    'vision': {
      icon: Eye,
      label: 'Vision',
      description: 'Image understanding and multimodal capabilities',
      className: 'text-purple-400'
    }
  };

  return capabilities[capabilityName.toLowerCase()] || null;
};


