import { useState, useEffect } from 'react';
import { LocalModel } from '@/types/models';
import { fetchLocalModels } from '@/services/models-api';

interface UseLocalModelsReturn {
  models: LocalModel[];
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export function useLocalModels(): UseLocalModelsReturn {
  const [models, setModels] = useState<LocalModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadModels = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchLocalModels();
      setModels(data.data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch local models'));
      console.error('Failed to load local models:', err);
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