/**
 * ProviderModalContext
 *
 * Singleton provider for ProviderCredentialModal.
 * Allows opening the modal from anywhere in the app.
 */

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { toast } from 'sonner';
import { listProviders, updateProvider, ProviderInfo, Credentials } from '@/services/providers-api';
import { ProviderCredentialModal } from '@/pages/settings/ProviderCredentialModal';
import type { CredentialFormValues } from '@/pages/settings/ProviderCredentialForm';

// ============================================================================
// Types
// ============================================================================

interface ProviderModalContextValue {
  /** Open the modal for a specific provider */
  openProviderModal: (providerName: string, onSuccess?: () => void) => Promise<void>;
  /** Whether the modal is currently open */
  isOpen: boolean;
}

// ============================================================================
// Context
// ============================================================================

const ProviderModalContext = createContext<ProviderModalContextValue>({
  openProviderModal: async () => {},
  isOpen: false,
});

// ============================================================================
// Hook
// ============================================================================

export function useProviderModal() {
  return useContext(ProviderModalContext);
}

// ============================================================================
// Provider
// ============================================================================

interface ProviderModalProviderProps {
  children: ReactNode;
}

export function ProviderModalProvider({ children }: ProviderModalProviderProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [provider, setProvider] = useState<ProviderInfo | null>(null);
  const [credentialValues, setCredentialValues] = useState<CredentialFormValues>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [onSuccessCallback, setOnSuccessCallback] = useState<(() => void) | undefined>();

  const handleCloseModal = useCallback(() => {
    setModalOpen(false);
    setCredentialValues({});
    setShowKeys({});
    setProvider(null);
    setOnSuccessCallback(undefined);
  }, []);

  const handleToggleShowKey = useCallback((field: string) => {
    setShowKeys((prev) => ({ ...prev, [field]: !prev[field] }));
  }, []);

  const buildCredentials = useCallback((providerInfo: ProviderInfo, values: CredentialFormValues): Credentials => {
    const providerType = providerInfo.provider_type.toLowerCase();

    switch (providerType) {
      case 'api_key':
        if (values.endpoint) {
          return { api_key: values.api_key, endpoint: values.endpoint };
        }
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
        }
        return {
          access_key: values.access_key,
          access_secret: values.access_secret,
          region: values.region || undefined,
        };

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
        return { api_key: values.api_key };
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (!provider) return;

    setSaving(true);
    try {
      const credentials = buildCredentials(provider, credentialValues);
      await updateProvider(provider.name, { credentials });
      toast.success(`${provider.name} credentials saved`);
      handleCloseModal();
      onSuccessCallback?.();
    } catch (err) {
      toast.error('Failed to save credentials', {
        description: err instanceof Error ? err.message : 'An error occurred',
      });
    } finally {
      setSaving(false);
    }
  }, [provider, credentialValues, buildCredentials, handleCloseModal, onSuccessCallback]);

  const openProviderModal = useCallback(async (providerName: string, onSuccess?: () => void) => {
    try {
      const providers = await listProviders();
      const found = providers.find((p) => p.name.toLowerCase() === providerName.toLowerCase());

      if (!found) {
        toast.error(`Provider "${providerName}" not found`);
        return;
      }

      setProvider(found);
      setCredentialValues({});
      setShowKeys({});
      setOnSuccessCallback(() => onSuccess);
      setModalOpen(true);
    } catch (err) {
      toast.error('Failed to load provider', {
        description: err instanceof Error ? err.message : 'An error occurred',
      });
    }
  }, []);

  const value: ProviderModalContextValue = {
    openProviderModal,
    isOpen: modalOpen,
  };

  return (
    <ProviderModalContext.Provider value={value}>
      {children}
      <ProviderCredentialModal
        open={modalOpen}
        provider={provider}
        values={credentialValues}
        showKeys={showKeys}
        saving={saving}
        onOpenChange={handleCloseModal}
        onChange={setCredentialValues}
        onToggleShow={handleToggleShowKey}
        onSave={handleSave}
      />
    </ProviderModalContext.Provider>
  );
}

export default ProviderModalProvider;
