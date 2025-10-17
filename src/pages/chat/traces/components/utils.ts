/**
 * Get short model name by extracting the part after the last '/'
 */
export const getShortModelName = (modelName: string | undefined | null): string => {
  if (!modelName || modelName.trim() === '') return 'Unknown model';
  if (modelName.includes('/')) {
    return modelName.split('/').pop() || modelName;
  }
  return modelName;
};

/**
 * Infer provider from model name
 */
const inferProvider = (modelName: string): string => {
  const lowerName = modelName.toLowerCase();

  // Check for common provider patterns
  if (lowerName.startsWith('gpt-') || lowerName.includes('davinci') || lowerName.includes('turbo')) {
    return 'openai';
  }
  if (lowerName.startsWith('claude')) {
    return 'anthropic';
  }
  if (lowerName.startsWith('gemini') || lowerName.includes('palm')) {
    return 'google';
  }
  if (lowerName.startsWith('llama')) {
    return 'meta';
  }
  if (lowerName.startsWith('mistral') || lowerName.includes('mixtral')) {
    return 'mistral';
  }
  if (lowerName.startsWith('command')) {
    return 'cohere';
  }
  if (lowerName.startsWith('titan')) {
    return 'amazon';
  }

  return 'unknown';
};

/**
 * Group models by their provider
 */
export const getProvidersByNames = (
  modelNames: string[]
): Array<{ provider: string; models: string[] }> => {
  const providerMap = new Map<string, string[]>();

  modelNames.forEach((modelName) => {
    if (!modelName || typeof modelName !== 'string') return;

    let provider: string;
    let fullModelName: string;

    // Extract provider from model name (format: provider/model)
    if (modelName.includes('/')) {
      const parts = modelName.split('/');
      provider = parts[0] || 'unknown';
      fullModelName = modelName;
    } else {
      // Infer provider from model name
      provider = inferProvider(modelName);
      fullModelName = `${provider}/${modelName}`;
    }

    const existingModels = providerMap.get(provider) || [];
    if (!existingModels.includes(fullModelName)) {
      providerMap.set(provider, [...existingModels, fullModelName]);
    }
  });

  return Array.from(providerMap.entries()).map(([provider, models]) => ({
    provider,
    models,
  }));
};

/**
 * Format time for table display - matches langdb-cloud-ui-new
 */
export const formatTimeForTable = (timestampMs: number): string => {
  const date = new Date(timestampMs);
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();

  if (isToday) {
    // Just show time if it's today
    return date.toLocaleString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } else {
    // Show date and time if it's not today
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }
};

/**
 * Calculate duration in seconds from milliseconds - matches getDurations from langdb-cloud-ui-new
 */
export const getDuration = (startTimeMs: number, endTimeMs: number): string => {
  const seconds = (endTimeMs - startTimeMs) / 1000;
  const secondsWith2Decimals = seconds.toFixed(2);
  if (secondsWith2Decimals === '0.00') {
    return '<0.01';
  }
  return secondsWith2Decimals;
};
