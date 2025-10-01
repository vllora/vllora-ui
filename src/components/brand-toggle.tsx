import { Palette, Check } from "lucide-react"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu"
import colors from 'tailwindcss/colors'

type BrandColor = "emerald" | "rose" | "blue" | "purple" | "amber" | "cyan" | "pink" | "indigo" | "sky" | "violet" | "fuchsia" | "lime" | "green" | "teal" | "red" | "orange"

const brandColorsList: { value: BrandColor; label: string }[] = [
  { value: "emerald", label: "Emerald" },
  { value: "rose", label: "Rose" },
  { value: "blue", label: "Blue" },
  { value: "purple", label: "Purple" },
  { value: "amber", label: "Amber" },
  { value: "cyan", label: "Cyan" },
  { value: "pink", label: "Pink" },
  { value: "indigo", label: "Indigo" },
  { value: "sky", label: "Sky" },
  { value: "violet", label: "Violet" },
  { value: "fuchsia", label: "Fuchsia" },
  { value: "lime", label: "Lime" },
  { value: "green", label: "Green" },
  { value: "teal", label: "Teal" },
  { value: "red", label: "Red" },
  { value: "orange", label: "Orange" },
]

// Convert hex to RGB
function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  return result
    ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
    : "0, 0, 0"
}

function applyBrandColor(color: BrandColor) {
  const tailwindColor = colors[color] as Record<string, string>

  if (tailwindColor) {
    // Update all theme shade CSS variables
    Object.entries(tailwindColor).forEach(([shade, hexValue]) => {
      if (typeof hexValue === 'string' && shade !== 'DEFAULT') {
        const rgb = hexToRgb(hexValue)
        document.documentElement.style.setProperty(`--theme-${shade}`, rgb)

        // Update --theme-rgb for the 500 shade (used in shadows)
        if (shade === '500') {
          document.documentElement.style.setProperty("--theme-rgb", rgb)
        }
      }
    })
  }
}

function getBrandFromStorage(): BrandColor {
  return (localStorage.getItem("brand-color") as BrandColor) || "emerald"
}

export function BrandToggle() {
  const [currentBrand, setCurrentBrand] = useState<BrandColor>(() => getBrandFromStorage())

  useEffect(() => {
    // Apply brand color on mount
    applyBrandColor(currentBrand)
  }, [])

  const changeBrand = (brand: BrandColor) => {
    setCurrentBrand(brand)
    localStorage.setItem("brand-color", brand)
    applyBrandColor(brand)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon">
          <Palette className="h-[1.2rem] w-[1.2rem]" />
          <span className="sr-only">Choose brand color</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>Brand Color</DropdownMenuLabel>
        {brandColorsList.map((brand) => {
          const tailwindColor = colors[brand.value] as Record<string, string>
          const colorPreview = tailwindColor?.['500'] || '#000000'

          return (
            <DropdownMenuItem
              key={brand.value}
              onClick={() => changeBrand(brand.value)}
              className="flex items-center gap-2"
            >
              {currentBrand === brand.value && (
                <Check className="h-4 w-4" />
              )}
              {currentBrand !== brand.value && (
                <span className="h-4 w-4" />
              )}
              <div className="flex items-center gap-2 flex-1">
                <div
                  className="w-4 h-4 rounded-full"
                  style={{ backgroundColor: colorPreview }}
                />
                {brand.label}
              </div>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
