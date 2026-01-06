/**
 * ProviderConfigDialog
 *
 * Legacy wrapper that uses the singleton ProviderModalContext.
 * Opens the provider credential modal when `open` becomes true.
 *
 * For new code, prefer using `useProviderModal().openProviderModal()` directly.
 */

import React, { useEffect, useRef } from 'react';
import { useProviderModal } from '@/contexts/ProviderModalContext';
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
  const { openProviderModal, isOpen } = useProviderModal();
  const { refetchProviders } = ProviderKeysConsumer();
  const hasOpenedRef = useRef(false);

  // Open modal when `open` prop becomes true
  useEffect(() => {
    if (open && !hasOpenedRef.current) {
      hasOpenedRef.current = true;
      openProviderModal(providerName, () => {
        refetchProviders();
        onSaveSuccess?.();
      });
    }
  }, [open, providerName, openProviderModal, refetchProviders, onSaveSuccess]);

  // Sync modal close state back to parent
  useEffect(() => {
    if (hasOpenedRef.current && !isOpen) {
      hasOpenedRef.current = false;
      onOpenChange(false);
    }
  }, [isOpen, onOpenChange]);

  // This component doesn't render anything - the singleton renders the modal
  return null;
};
