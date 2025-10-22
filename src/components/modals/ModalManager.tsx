import React, { useEffect } from 'react';
import { useModal, setGlobalModalContext } from '@/contexts/ModalContext';
import { ToolsModal } from './ToolsModal';

export const ModalManager: React.FC = () => {
  const modalContext = useModal();

  // Set the global context so openModal can be called from anywhere
  useEffect(() => {
    setGlobalModalContext(modalContext);
  }, [modalContext]);

  const renderModal = () => {
    switch (modalContext.currentModal) {
      case 'tools':
        return (
          <ToolsModal
            open={modalContext.isOpen}
            onOpenChange={(open) => {
              if (!open) {
                modalContext.closeModal();
              }
            }}
            toolsUsage={modalContext.toolsUsage}
            setToolsUsage={modalContext.setToolsUsage}
          />
        );
      default:
        return null;
    }
  };

  return <>{renderModal()}</>;
};
