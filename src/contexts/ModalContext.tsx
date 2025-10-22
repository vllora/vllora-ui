import { createContext, useContext, useState, ReactNode } from 'react';
import { McpServerConfig } from '@/services/mcp-api';

export type ModalType = 'tools' | 'settings' | 'provider-keys' | null;

interface ModalContextType {
  openModal: (modalType: ModalType) => void;
  closeModal: () => void;
  currentModal: ModalType;
  isOpen: boolean;
  toolsUsage: Map<string, McpServerConfig>;
  setToolsUsage: (toolsUsage: Map<string, McpServerConfig>) => void;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

interface ModalProviderProps {
  children: ReactNode;
}

export function ModalProvider({ children }: ModalProviderProps) {
  const [currentModal, setCurrentModal] = useState<ModalType>(null);
  const [toolsUsage, setToolsUsage] = useState<Map<string, McpServerConfig>>(new Map());

  const openModal = (modalType: ModalType) => {
    setCurrentModal(modalType);
  };

  const closeModal = () => {
    setCurrentModal(null);
  };

  const isOpen = currentModal !== null;

  return (
    <ModalContext.Provider
      value={{
        openModal,
        closeModal,
        currentModal,
        isOpen,
        toolsUsage,
        setToolsUsage,
      }}
    >
      {children}
    </ModalContext.Provider>
  );
}

export function useModal() {
  const context = useContext(ModalContext);
  if (context === undefined) {
    throw new Error('useModal must be used within a ModalProvider');
  }
  return context;
}

// Global function that can be called from anywhere
let globalModalContext: ModalContextType | null = null;

export const setGlobalModalContext = (context: ModalContextType) => {
  globalModalContext = context;
};

export const openModal = (modalType: ModalType) => {
  if (globalModalContext) {
    globalModalContext.openModal(modalType);
  } else {
    console.warn('Modal context not initialized. Make sure ModalProvider is mounted.');
  }
};

export const closeModal = () => {
  if (globalModalContext) {
    globalModalContext.closeModal();
  }
};
