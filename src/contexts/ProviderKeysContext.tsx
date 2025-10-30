import { createContext, useContext, ReactNode, useState } from 'react';
import { useRequest } from 'ahooks';
import { toast } from 'sonner';
import {
  listProviders,
  updateProvider,
  deleteProvider,
  type ProviderInfo,
  type Credentials,
} from '@/services/providers-api';
import type { CredentialFormValues } from '@/pages/settings/ProviderCredentialForm';
import { LocalModelsConsumer } from './LocalModelsContext';

export type ProviderKeysContextType = ReturnType<typeof useProviderKeys>;

const ProviderKeysContext = createContext<ProviderKeysContextType | undefined>(undefined);

// All providers now use modal for consistency
export const shouldUseModal = (): boolean => {
  return true;
};

export function useProviderKeys() {

  const {refetchModels} = LocalModelsConsumer()
  const { data: providers = [], loading, error, run: refetchProviders } = useRequest(listProviders, {
    onError: (err) => {
      toast.error('Failed to load providers', {
        description: err.message || 'An error occurred while loading providers',
      });
    },
  });

  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [providerToDelete, setProviderToDelete] = useState<string | null>(null);
  const [credentialValues, setCredentialValues] = useState<Record<string, CredentialFormValues>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [localError, setLocalError] = useState<string | null>(null);

  const buildCredentials = (provider: ProviderInfo, values: CredentialFormValues): Credentials => {
    const providerType = provider.provider_type.toLowerCase();

    switch (providerType) {
      case 'api_key':
        return { api_key: values.api_key };

      case 'api_key_with_endpoint':
        return { api_key: values.api_key, endpoint: values.endpoint };

      case 'aws':
      case 'bedrock':
        if (values.auth_method === 'api_key') {
          return {
            api_key: values.api_key,
            region: values.region || undefined,
          };
        } else {
          return {
            access_key: values.access_key,
            access_secret: values.access_secret,
            region: values.region || undefined,
          };
        }

      case 'vertex':
      case 'vertexai':
        const credentialsJson = JSON.parse(values.credentials_json);
        return {
          region: values.region,
          credentials: credentialsJson,
        };

      case 'langdb':
        return { api_key: values.api_key };

      default:
        // Default to API key
        return { api_key: values.api_key };
    }
  };

  const saveProvider = async (providerName: string) => {
    const values = credentialValues[providerName];
    const provider = providers.find(p => p.name === providerName);

    if (!provider) {
      toast.error('Provider not found');
      return;
    }

    // Validate required fields based on provider type
    const providerType = provider.provider_type.toLowerCase();
    if (providerType !== 'langdb') {
      if (providerType === 'vertex' || providerType === 'vertexai') {
        if (!values?.region?.trim() || !values?.credentials_json?.trim()) {
          toast.error('Please fill in all required fields');
          return;
        }
        // Validate JSON
        try {
          JSON.parse(values.credentials_json);
        } catch {
          toast.error('Invalid JSON format for service account credentials');
          return;
        }
      } else if (providerType === 'aws' || providerType === 'bedrock') {
        if (values?.auth_method === 'api_key') {
          if (!values?.api_key?.trim()) {
            toast.error('API key is required');
            return;
          }
        } else {
          if (!values?.access_key?.trim() || !values?.access_secret?.trim()) {
            toast.error('Access key and secret are required');
            return;
          }
        }
      } else {
        if (!values?.api_key?.trim()) {
          toast.error('API key is required');
          return;
        }
      }
    }

    try {
      setSaving({ ...saving, [providerName]: true });
      setLocalError(null);

      const credentials = buildCredentials(provider, values || {});
      await updateProvider(providerName, {
        credentials,
        provider_type: provider.provider_type,
      });

      toast.success('Provider credentials saved', {
        description: `${providerName} credentials have been saved successfully`,
      });
      setEditingProvider(null);
      setCredentialValues({ ...credentialValues, [providerName]: {} });
      await refetchProviders();
      refetchModels();
    } catch (err) {
      toast.error('Failed to save provider', {
        description: err instanceof Error ? err.message : 'An error occurred while saving provider',
      });
    } finally {
      setSaving({ ...saving, [providerName]: false });
    }
  };

  const startDeleteProvider = (providerName: string) => {
    setProviderToDelete(providerName);
    setDeleteDialogOpen(true);
  };

  const confirmDeleteProvider = async () => {
    if (!providerToDelete) return;

    try {
      setSaving({ ...saving, [providerToDelete]: true });
      setLocalError(null);

      await deleteProvider(providerToDelete);

      toast.success('Provider credentials deleted', {
        description: `${providerToDelete} credentials have been deleted successfully`,
      });

      setDeleteDialogOpen(false);
      setProviderToDelete(null);
      await refetchProviders();
      refetchModels();
    } catch (err) {
      toast.error('Failed to delete provider', {
        description: err instanceof Error ? err.message : 'An error occurred while deleting provider',
      });
    } finally {
      setSaving({ ...saving, [providerToDelete]: false });
    }
  };

  const cancelDeleteProvider = () => {
    setDeleteDialogOpen(false);
    setProviderToDelete(null);
  };

  const toggleShowKey = (providerName: string) => {
    setShowKeys({ ...showKeys, [providerName]: !showKeys[providerName] });
  };

  const startEditing = (providerName: string) => {
    setEditingProvider(providerName);
    setLocalError(null);
  };

  const cancelEditing = () => {
    setEditingProvider(null);
    setCredentialValues({});
    setLocalError(null);
  };

  const updateCredentialValues = (providerName: string, values: CredentialFormValues) => {
    setCredentialValues({ ...credentialValues, [providerName]: values });
  };

  const toggleShowKeyField = (providerName: string, field: string) => {
    const key = `${providerName}_${field}`;
    setShowKeys({ ...showKeys, [key]: !showKeys[key] });
  };

  const getShowKeyField = (providerName: string, field: string): boolean => {
    const key = `${providerName}_${field}`;
    return showKeys[key] || false;
  };

  // Combine errors from useRequest and local errors
  const combinedError = localError || (error ? error.message : null);

  return {
    providers,
    loading,
    error: combinedError,
    editingProvider,
    modalOpen,
    deleteDialogOpen,
    providerToDelete,
    credentialValues,
    showKeys,
    saving,
    refetchProviders,
    saveProvider,
    startDeleteProvider,
    confirmDeleteProvider,
    cancelDeleteProvider,
    toggleShowKey,
    toggleShowKeyField,
    getShowKeyField,
    startEditing,
    cancelEditing,
    updateCredentialValues,
    setModalOpen,
  };
}

export function ProviderKeysProvider({ children }: { children: ReactNode }) {
  const value = useProviderKeys();
  return <ProviderKeysContext.Provider value={value}>{children}</ProviderKeysContext.Provider>;
}

export function ProviderKeysConsumer() {
  const context = useContext(ProviderKeysContext);
  if (context === undefined) {
    throw new Error('ProviderKeysConsumer must be used within a ProviderKeysProvider');
  }
  return context;
}
