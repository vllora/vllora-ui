import React, { useState, useMemo, useCallback } from 'react';
import { ProviderCredentialModal } from '@/pages/settings/ProviderCredentialModal';
import { ProviderKeysConsumer } from '@/contexts/ProviderKeysContext';
interface ProviderConfigDialogProps {
  open: boolean;
  providerName: string;
  onOpenChange: (open: boolean) => void;
  onSaveSuccess?: () => void;
}

export const ProviderConfigDialog: React.FC<ProviderConfigDialogProps> = ({
  open,
  providerName,
  onOpenChange,
  onSaveSuccess,
}) => {
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
 const {
        providers,
        loading,
        saving,
        saveProvider,
        refetchProviders,
        updateCredentialValues,
        credentialValues
    } = ProviderKeysConsumer();

  let provider = useMemo(() => {
    return providers.find(p => p.name === providerName);
  }, [providers, providerName]);

 

  const handleSave = useCallback(async () => {
  saveProvider(providerName)
  onOpenChange(false);
  onSaveSuccess?.();
  }, [providerName, saveProvider, onOpenChange, onSaveSuccess]);

  const handleToggleShow = (field: string) => {
    setShowKeys(prev => ({
      ...prev,
      [field]: !prev[field],
    }));
  };

  const handleRefresh = async () => {
    if (provider) {
      refetchProviders();
    }
  };

  if (loading || !provider) {
    return null;
  }

  return (
    <ProviderCredentialModal
      open={open}
      provider={provider}
      values={credentialValues[providerName || ''] || {}}
      showKeys={showKeys}
      saving={saving[providerName]}
      onOpenChange={onOpenChange}
      onChange={(values) => providerName && updateCredentialValues(providerName, values)}
      onToggleShow={handleToggleShow}
      onSave={handleSave}
      onRefresh={handleRefresh}
    />
  );
};
