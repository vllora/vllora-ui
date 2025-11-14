import { createContext, useContext, ReactNode } from 'react';


export type AvailableApiKeysContextType = ReturnType<typeof useAvailableApiKeys>;

const AvailableApiKeysContext = createContext<AvailableApiKeysContextType | undefined>(undefined);
export interface AvailableApiKey {
    api_key: string,
    description?: string,
    name: string,
    permissions?: any,
    enabled: boolean
}
export function useAvailableApiKeys(props: { available_api_keys: AvailableApiKey[] }) {
    const { available_api_keys } = props


    return {
        available_api_keys

    }
}

export function AvailableApiKeysProvider({ available_api_keys, children }: { available_api_keys: AvailableApiKey[], children: ReactNode }) {
    const value = useAvailableApiKeys({ available_api_keys });
    return <AvailableApiKeysContext.Provider value={value}>{children}</AvailableApiKeysContext.Provider>;
}

export function AvailableApiKeysConsumer() {
    const context = useContext(AvailableApiKeysContext);
    if (context === undefined) {
        throw new Error('AvailableApiKeysConsumer must be used within a ProjectsProvider');
    }
    return context;
}
