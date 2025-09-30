import { useState, useEffect } from 'react';
import { ModelPricing } from '@/types/models';
import { fetchModels } from '@/services/models-api';

interface UseModelsReturn {
  models: ModelPricing[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useModels(): UseModelsReturn {
  const [models, setModels] = useState<ModelPricing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadModels = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchModels();
      setModels(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch models'));
      console.error('Failed to load models:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadModels();
  }, []);

  return {
    models,
    loading,
    error,
    refetch: loadModels,
  };
}