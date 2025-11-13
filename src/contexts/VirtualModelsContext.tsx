import { createContext, useContext, ReactNode } from 'react';
import { useRequest } from 'ahooks';
import { toast } from 'sonner';
import {
  fetchVirtualModels,
  createVirtualModel,
  deleteVirtualModel,
  CreateVirtualModelParams,
  VirtualModel
} from '@/services/virtual-models-api';

export type VirtualModelsContextType = ReturnType<typeof useVirtualModels>;

const VirtualModelsContext = createContext<VirtualModelsContextType | undefined>(undefined);

export function useVirtualModels(projectId?: string) {
  // Fetch virtual models
  const {
    data,
    loading,
    error,
    run: refetchVirtualModels
  } = useRequest<VirtualModel[], []>(
    () => fetchVirtualModels({ projectId }),
    {
      ready: !!projectId,
      refreshDeps: [projectId],
      onError: (err) => {
        toast.error('Failed to load virtual models', {
          description: err.message || 'An error occurred while loading virtual models',
        });
      },
    }
  );

  // Create virtual model
  const {
    loading: creating,
    runAsync: createVirtualModelAsync
  } = useRequest<VirtualModel, [Omit<CreateVirtualModelParams, 'projectId'>]>(
    async (params: Omit<CreateVirtualModelParams, 'projectId'>) => {
      if (!projectId) {
        throw new Error('Project ID is required');
      }
      return createVirtualModel({ ...params, projectId });
    },
    {
      manual: true,
      onSuccess: (data) => {
        toast.success(`Virtual Model "${data.name}" created successfully!`);
        refetchVirtualModels();
      },
      onError: (err) => {
        toast.error('Failed to create virtual model', {
          description: err.message || 'An error occurred while creating the virtual model',
        });
      },
    }
  );

  // Delete virtual model
  const {
    loading: deleting,
    runAsync: deleteVirtualModelAsync
  } = useRequest<void, [string]>(
    async (virtualModelId: string) => {
      if (!projectId) {
        throw new Error('Project ID is required');
      }
      return deleteVirtualModel({ projectId, virtualModelId });
    },
    {
      manual: true,
      onSuccess: () => {
        toast.success('Virtual Model deleted successfully!');
        refetchVirtualModels();
      },
      onError: (err) => {
        toast.error('Failed to delete virtual model', {
          description: err.message || 'An error occurred while deleting the virtual model',
        });
      },
    }
  );

  return {
    virtualModels: data || [],
    loading,
    creating,
    deleting,
    error,
    refetchVirtualModels,
    createVirtualModel: createVirtualModelAsync,
    deleteVirtualModel: deleteVirtualModelAsync,
  };
}

export function VirtualModelsProvider({
  projectId,
  children
}: {
  projectId?: string;
  children: ReactNode;
}) {
  const value = useVirtualModels(projectId);
  return <VirtualModelsContext.Provider value={value}>{children}</VirtualModelsContext.Provider>;
}

export function VirtualModelsConsumer() {
  const context = useContext(VirtualModelsContext);
  if (context === undefined) {
    throw new Error('VirtualModelsConsumer must be used within a VirtualModelsProvider');
  }
  return context;
}
