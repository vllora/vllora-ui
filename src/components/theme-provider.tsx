import { ThemeProvider as NextThemesProvider } from "next-themes"
import { type ThemeProviderProps as NextThemesProviderProps } from "next-themes"

export function ThemeProvider({ children, ...props }: NextThemesProviderProps) {
  return (
    <NextThemesProvider {...props} forcedTheme="dark">
      {children}
    </NextThemesProvider>
  )
}