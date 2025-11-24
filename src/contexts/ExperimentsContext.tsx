import { createContext, useContext, ReactNode } from 'react';
import { useRequest } from 'ahooks';
import { toast } from 'sonner';
import {
  listExperiments,
  deleteExperiment,
  type Experiment,
} from '@/services/experiments-api';

// Define the context type
interface ExperimentsContextType {
  experiments: Experiment[];
  loading: boolean;
  error: Error | undefined;
  refetchExperiments: () => void;
  handleDeleteExperiment: (id: string) => Promise<void>;
}

// Create the context
const ExperimentsContext = createContext<ExperimentsContextType | undefined>(undefined);

// Create the Provider
export function ExperimentsProvider({ children }: { children: ReactNode }) {
  const { data, loading, error, run: refetchExperiments } = useRequest(listExperiments, {
    onError: (err) => {
      toast.error('Failed to load experiments', {
        description: err.message || 'An error occurred while fetching experiments',
      });
    },
  });

  const handleDeleteExperiment = async (id: string) => {
    try {
      await deleteExperiment(id);
      toast.success('Experiment deleted', {
        description: 'The experiment has been removed successfully',
      });
      refetchExperiments();
    } catch (err) {
      toast.error('Failed to delete experiment', {
        description: err instanceof Error ? err.message : 'An error occurred',
      });
      throw err;
    }
  };

  const value: ExperimentsContextType = {
    experiments: data || [],
    loading,
    error,
    refetchExperiments,
    handleDeleteExperiment,
  };

  return <ExperimentsContext.Provider value={value}>{children}</ExperimentsContext.Provider>;
}

// Create the Consumer hook
export function ExperimentsConsumer() {
  const context = useContext(ExperimentsContext);
  if (context === undefined) {
    throw new Error('ExperimentsConsumer must be used within an ExperimentsProvider');
  }
  return context;
}
