import { createContext, useContext, ReactNode } from 'react';
import { useRequest } from 'ahooks';
import { toast } from 'sonner';
import {
  fetchVirtualModels,
  createVirtualModel,
  updateVirtualModel,
  deleteVirtualModel,
  fetchVirtualModelVersions,
  updateVirtualModelVersion,
  updateVirtualModelVersionMeta,
  CreateVirtualModelParams,
  UpdateVirtualModelParams,
  UpdateVersionParams,
  UpdateVersionMetaParams,
  VirtualModel,
  VirtualModelVersion
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

  // Update virtual model
  const {
    loading: updating,
    runAsync: updateVirtualModelAsync
  } = useRequest<VirtualModel, [Omit<UpdateVirtualModelParams, 'projectId'>]>(
    async (params: Omit<UpdateVirtualModelParams, 'projectId'>) => {
      if (!projectId) {
        throw new Error('Project ID is required');
      }
      return updateVirtualModel({ ...params, projectId });
    },
    {
      manual: true,
      onSuccess: (data) => {
        toast.success(`Virtual Model "${data.name}" updated successfully!`);
        refetchVirtualModels();
      },
      onError: (err) => {
        toast.error('Failed to update virtual model', {
          description: err.message || 'An error occurred while updating the virtual model',
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

  // Fetch versions of a virtual model
  const {
    loading: loadingVersions,
    runAsync: fetchVersionsAsync
  } = useRequest<VirtualModelVersion[], [string]>(
    async (virtualModelId: string) => {
      if (!projectId) {
        throw new Error('Project ID is required');
      }
      return fetchVirtualModelVersions({ projectId, virtualModelId });
    },
    {
      manual: true,
      onError: (err) => {
        toast.error('Failed to load versions', {
          description: err.message || 'An error occurred while loading versions',
        });
      },
    }
  );

  // Update version
  const {
    loading: updatingVersion,
    runAsync: updateVersionAsync
  } = useRequest<VirtualModel, [Omit<UpdateVersionParams, 'projectId'>]>(
    async (params: Omit<UpdateVersionParams, 'projectId'>) => {
      if (!projectId) {
        throw new Error('Project ID is required');
      }
      return updateVirtualModelVersion({ ...params, projectId });
    },
    {
      manual: true,
      onSuccess: (data) => {
        toast.success('Version updated successfully!');
        refetchVirtualModels();
      },
      onError: (err) => {
        toast.error('Failed to update version', {
          description: err.message || 'An error occurred while updating the version',
        });
      },
    }
  );

  // Update version metadata
  const {
    loading: updatingVersionMeta,
    runAsync: updateVersionMetaAsync
  } = useRequest<VirtualModel, [Omit<UpdateVersionMetaParams, 'projectId'>]>(
    async (params: Omit<UpdateVersionMetaParams, 'projectId'>) => {
      if (!projectId) {
        throw new Error('Project ID is required');
      }
      return updateVirtualModelVersionMeta({ ...params, projectId });
    },
    {
      manual: true,
      onSuccess: (data) => {
        toast.success('Version published successfully!');
        refetchVirtualModels();
      },
      onError: (err) => {
        toast.error('Failed to publish version', {
          description: err.message || 'An error occurred while publishing the version',
        });
      },
    }
  );

  return {
    virtualModels: data || [],
    loading,
    creating,
    updating,
    deleting,
    loadingVersions,
    updatingVersion,
    updatingVersionMeta,
    error,
    refetchVirtualModels,
    createVirtualModel: createVirtualModelAsync,
    updateVirtualModel: updateVirtualModelAsync,
    deleteVirtualModel: deleteVirtualModelAsync,
    fetchVersions: fetchVersionsAsync,
    updateVersion: updateVersionAsync,
    updateVersionMeta: updateVersionMetaAsync,
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
