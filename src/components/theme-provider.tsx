import { createContext, useContext, useEffect, useState } from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"
import { type ThemeProviderProps as NextThemesProviderProps } from "next-themes"

export type ThemeColor = "zinc" | "slate" | "stone" | "gray" | "neutral" | "red" | "rose" | "orange" | "green" | "blue" | "yellow" | "violet"

type ThemeColorContextType = {
  color: ThemeColor
  setColor: (color: ThemeColor) => void
}

const ThemeColorContext = createContext<ThemeColorContextType | undefined>(undefined)

export function useThemeColor() {
  const context = useContext(ThemeColorContext)
  if (context === undefined)
    throw new Error("useThemeColor must be used within a ThemeProvider")
  return context
}

interface ThemeProviderProps extends NextThemesProviderProps {
  defaultColor?: ThemeColor
  colorStorageKey?: string
}

export function ThemeProvider({
  children,
  defaultColor = "zinc",
  colorStorageKey = "vite-ui-color",
  ...props
}: ThemeProviderProps) {
  const [color, setColorState] = useState<ThemeColor>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem(colorStorageKey) as ThemeColor) || defaultColor
    }
    return defaultColor
  })

  useEffect(() => {
    const root = window.document.documentElement

    // Remove all theme color classes
    root.classList.remove(
      "theme-zinc",
      "theme-slate",
      "theme-stone",
      "theme-gray",
      "theme-neutral",
      "theme-red",
      "theme-rose",
      "theme-orange",
      "theme-green",
      "theme-blue",
      "theme-yellow",
      "theme-violet"
    )

    // Add the new theme color class
    root.classList.add(`theme-${color}`)
  }, [color])

  const setColor = (newColor: ThemeColor) => {
    localStorage.setItem(colorStorageKey, newColor)
    setColorState(newColor)
  }

  return (
    <NextThemesProvider {...props}>
      <ThemeColorContext.Provider value={{ color, setColor }}>
        {children}
      </ThemeColorContext.Provider>
    </NextThemesProvider>
  )
}