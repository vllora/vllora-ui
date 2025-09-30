import { Moon, Sun, Palette, Check } from "lucide-react"
import { useTheme } from "next-themes"
import { useThemeColor, type ThemeColor } from "./theme-provider"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu"

const themeColors: { value: ThemeColor; label: string }[] = [
  { value: "zinc", label: "Zinc" },
  { value: "slate", label: "Slate" },
  { value: "stone", label: "Stone" },
  { value: "gray", label: "Gray" },
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
  const { setTheme } = useTheme()
  const { color, setColor } = useThemeColor()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon">
          <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Theme Mode</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => setTheme("light")}>
          <Sun className="mr-2 h-4 w-4" />
          Light
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("dark")}>
          <Moon className="mr-2 h-4 w-4" />
          Dark
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme("system")}>
          <span className="mr-2 h-4 w-4" />
          System
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Palette className="mr-2 h-4 w-4" />
            Theme Color
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-96 overflow-y-auto">
            {themeColors.map((themeColor) => (
              <DropdownMenuItem
                key={themeColor.value}
                onClick={() => setColor(themeColor.value)}
              >
                {color === themeColor.value && (
                  <Check className="mr-2 h-4 w-4" />
                )}
                {color !== themeColor.value && (
                  <span className="mr-2 h-4 w-4" />
                )}
                {themeColor.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}