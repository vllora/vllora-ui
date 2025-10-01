import { createContext, useContext, ReactNode } from 'react';
import { useRequest } from 'ahooks';
import { toast } from 'sonner';
import { fetchLocalModels } from '@/services/models-api';
import { LocalModel } from '@/types/models';

interface LocalModelsContextType {
  models: LocalModel[];
  loading: boolean;
  error: Error | undefined;
  refetchModels: () => void;
}

const LocalModelsContext = createContext<LocalModelsContextType | undefined>(undefined);

export function LocalModelsProvider({ children }: { children: ReactNode }) {
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

  const value: LocalModelsContextType = {
    models: data || [],
    loading,
    error,
    refetchModels,
  };

  return <LocalModelsContext.Provider value={value}>{children}</LocalModelsContext.Provider>;
}

export function LocalModelsConsumer() {
  const context = useContext(LocalModelsContext);
  if (context === undefined) {
    throw new Error('LocalModelsConsumer must be used within a LocalModelsProvider');
  }
  return context;
}
