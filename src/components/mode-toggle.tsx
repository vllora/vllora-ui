import { Palette, Check } from "lucide-react"
import { useState } from "react"
import { applyTheme, getThemeFromStorage, type ThemeColor } from "@/themes/themes"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"

const themeColors: { value: ThemeColor; label: string }[] = [
  { value: "zinc", label: "Zinc" },
  { value: "slate", label: "Slate" },
  { value: "stone", label: "Stone" },
  { value: "neutral", label: "Neutral" },
  { value: "red", label: "Red" },
  { value: "rose", label: "Rose" },
  { value: "orange", label: "Orange" },
  { value: "green", label: "Green" },
  { value: "blue", label: "Blue" },
  { value: "yellow", label: "Yellow" },
  { value: "violet", label: "Violet" },
]

export function ModeToggle() {
  const [currentTheme, setCurrentTheme] = useState<ThemeColor>(() => getThemeFromStorage())

  const changeTheme = (theme: ThemeColor) => {
    setCurrentTheme(theme)
    localStorage.setItem("theme-color", theme)
    applyTheme(theme)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon">
          <Palette className="h-[1.2rem] w-[1.2rem]" />
          <span className="sr-only">Choose color theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Color Theme</DropdownMenuLabel>
        {themeColors.map((theme) => (
          <DropdownMenuItem
            key={theme.value}
            onClick={() => changeTheme(theme.value)}
          >
            {currentTheme === theme.value && (
              <Check className="mr-2 h-4 w-4" />
            )}
            {currentTheme !== theme.value && (
              <span className="mr-2 h-4 w-4" />
            )}
            {theme.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}