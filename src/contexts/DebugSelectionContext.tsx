import React, { createContext, useContext, useState, useMemo } from 'react';
import { Span } from '@/types/common-type';

interface DebugSelectionContextType {
  selectedSpan: Span | null;
  setSelectedSpan: (span: Span | null) => void;
}

const DebugSelectionContext = createContext<DebugSelectionContextType | undefined>(undefined);

export const DebugSelectionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedSpan, setSelectedSpan] = useState<Span | null>(null);

  const value = useMemo(
    () => ({ selectedSpan, setSelectedSpan }),
    [selectedSpan]
  );

  return (
    <DebugSelectionContext.Provider value={value}>
      {children}
    </DebugSelectionContext.Provider>
  );
};

export const useDebugSelection = () => {
  const context = useContext(DebugSelectionContext);
  if (!context) {
    throw new Error('useDebugSelection must be used within a DebugSelectionProvider');
  }
  return context;
};
