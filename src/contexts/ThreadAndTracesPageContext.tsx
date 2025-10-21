import { createContext, useContext, ReactNode } from 'react';

export type ThreadAndTracesPageContextType = ReturnType<typeof useThreadAndTracesPage>;

const ThreadAndTracesPageContext = createContext<ThreadAndTracesPageContextType | undefined>(undefined);

export function useThreadAndTracesPage() {

    
  return {
   
  };
}

export function ThreadAndTracesPageProvider({ children }: { children: ReactNode }) {
  const value = useThreadAndTracesPage();
  return <ThreadAndTracesPageContext.Provider value={value}>{children}</ThreadAndTracesPageContext.Provider>;
}

export function ThreadAndTracesPageConsumer() {
  const context = useContext(ThreadAndTracesPageContext);
  if (context === undefined) {
    throw new Error('ThreadAndTracesPageConsumer must be used within a ThreadAndTracesPageProvider');
  }
  return context;
}
