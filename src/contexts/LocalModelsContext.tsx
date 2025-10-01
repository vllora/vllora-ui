import { createContext, useContext, ReactNode } from 'react';
import { useRequest } from 'ahooks';
import { toast } from 'sonner';
import { fetchLocalModels } from '@/services/models-api';

export type LocalModelsContextType = ReturnType<typeof useLocalModels>;

const LocalModelsContext = createContext<LocalModelsContextType | undefined>(undefined);

export function useLocalModels() {
  const { data, loading, error, run: refetchModels } = useRequest(
    async () => {
      const response = await fetchLocalModels();
      return response.data;
    },
    {
      onError: (err) => {
        toast.error('Failed to load local models', {
          description: err.message || 'An error occurred while loading local models',
        });
      },
    }
  );

  return {
    models: data || [],
    loading,
    error,
    refetchModels,
  };
}

export function LocalModelsProvider({ children }: { children: ReactNode }) {
  const value = useLocalModels();
  return <LocalModelsContext.Provider value={value}>{children}</LocalModelsContext.Provider>;
}

export function LocalModelsConsumer() {
  const context = useContext(LocalModelsContext);
  if (context === undefined) {
    throw new Error('LocalModelsConsumer must be used within a LocalModelsProvider');
  }
  return context;
}
