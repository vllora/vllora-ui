import { ReactNode, createContext, useContext } from "react";
export type CurrentAppContextType = ReturnType<typeof useCurrentApp>;

export type AppMode = 'langdb' | 'vllora';

export const CurrentAppContext = createContext<CurrentAppContextType | null>(null);
function useCurrentApp(props: {
    app_mode: AppMode;
}) {
    const { app_mode } = props

    return {
        app_mode
    }
}
export function CurrentAppProvider({ children, app_mode }: { children: ReactNode, app_mode: 'langdb' | 'vllora' }) {
    const value = useCurrentApp({ app_mode });
    return <CurrentAppContext.Provider value={value}>{children}</CurrentAppContext.Provider>;
}
export function CurrentAppConsumer() {
    const value = useContext(CurrentAppContext);
    if (value === null) {
        throw new Error("CurrentAppProvider must be used within a CurrentAppConsumer");
    }
    return value;
}
