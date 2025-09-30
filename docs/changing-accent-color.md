# Changing the Accent Color

Ellora UI uses a **theme color system** that allows you to easily change the accent color throughout the entire interface by modifying just one line of code.

## Quick Start

To change the accent color from emerald to any other color:

1. Open `/tailwind.config.js`
2. Find line 57: `theme: colors.emerald,`
3. Change `emerald` to any Tailwind color: `rose`, `blue`, `purple`, `amber`, `sky`, `indigo`, `violet`, `fuchsia`, `pink`, `red`, `orange`, `yellow`, `lime`, `green`, `teal`, `cyan`, etc.

**Example:**
```javascript
// In tailwind.config.js
colors: {
  // ... other colors
  theme: colors.rose,  // Change this line!
}
```

That's it! All components will automatically use the new color.

## How It Works

All components use `theme-*` classes instead of hardcoded color names:

```tsx
// ✅ Good - Uses theme system
className="text-theme-500 bg-theme-500/10 hover:bg-theme-500/20"

// ❌ Bad - Hardcoded color
className="text-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20"
```

The `theme` color is defined in `tailwind.config.js` and mapped to any Tailwind color palette using `colors.emerald` (or any other color).

## Components Using Theme Colors

All core UI components use the theme color system:

### Navigation
- **AppSidebar** (`/src/components/app-sidebar.tsx`)
  - Active menu items: `bg-theme-500/10 text-theme-500`
  - Hover states: `hover:bg-theme-500/10 hover:text-theme-500`

- **ProjectDropdown** (`/src/components/ProjectDropdown.tsx`)
  - Folder icons: `text-theme-500`
  - Hover borders: `hover:border-theme-500/30`
  - Selected project icon: `text-theme-500`
  - "New Project" button: `text-theme-600 dark:text-theme-400 hover:bg-theme-500/10`

### Chat Interface
- **ChatSidebar** (`/src/components/chat/ChatSidebar.tsx`)
  - "New Chat" button: `text-theme-600 dark:text-theme-400 hover:bg-theme-500/10`

### Projects
- **Projects Page** (`/src/pages/projects.tsx`)
  - Page header icon: `text-theme-500`
  - "New Project" button: `from-theme-400 to-theme-600 hover:from-theme-500 hover:to-theme-700`
  - Card hover borders: `hover:border-theme-500/50`
  - Project folder icons: `text-theme-500`

### Home Page
- **Home Page** (`/src/pages/home.tsx`)
  - "Gallery" gradient text: `from-theme-400 to-theme-600`
  - Server status icon: `text-theme-500`
  - Localhost text: `text-theme-500`

## Available Colors

You can use any Tailwind CSS color:

- **Reds**: `red`, `rose`, `pink`
- **Oranges**: `orange`, `amber`, `yellow`
- **Greens**: `lime`, `green`, `emerald`, `teal`
- **Blues**: `cyan`, `sky`, `blue`, `indigo`
- **Purples**: `violet`, `purple`, `fuchsia`

Each color has shades from 50 to 900, all automatically available through the theme system.

## Configuration Details

### Tailwind Config (`tailwind.config.js`)

```javascript
import colors from 'tailwindcss/colors'

export default {
  // ...
  safelist: [
    // Ensures theme colors are always available
    { pattern: /^(bg|text|border|hover:bg|hover:text|hover:border|dark:text|from|to)-theme-(50|100|200|300|400|500|600|700|800|900)/ },
  ],
  theme: {
    extend: {
      colors: {
        // ... other colors
        theme: colors.emerald,  // 👈 Change this!
      },
    },
  },
}
```

### Common Usage Patterns

```tsx
// Text colors
className="text-theme-500"                    // Standard text
className="text-theme-600 dark:text-theme-400" // Light/dark mode

// Backgrounds
className="bg-theme-500"                      // Solid background
className="bg-theme-500/10"                   // 10% opacity
className="bg-theme-500/20"                   // 20% opacity

// Hover states
className="hover:bg-theme-500/10"
className="hover:text-theme-500"
className="hover:border-theme-500/30"

// Gradients
className="bg-gradient-to-r from-theme-400 to-theme-600"
className="from-theme-500 to-theme-700"

// Borders
className="border-theme-500"
className="border-theme-500/50"
```

## Best Practices

### Contrast and Accessibility
- Test your color in both light and dark modes
- Ensure sufficient contrast for text (WCAG AA: 4.5:1 minimum)
- Use lighter shades (300, 400) in dark mode
- Use darker shades (600, 700) in light mode

### Opacity Levels
- **10%** (`/10`) - Subtle backgrounds, hover states
- **20%** (`/20`) - Medium emphasis backgrounds
- **30%** (`/30`) - Borders
- **50%** (`/50`) - Stronger borders, dividers

### Shade Selection
- **50-200**: Very light backgrounds, borders
- **300-400**: Light text, dark mode primary text
- **500**: Main accent color, icons
- **600-700**: Primary text in light mode, hover states
- **800-900**: Strong emphasis, rarely used

## Troubleshooting

### Colors not showing up?
1. Restart your dev server after changing `tailwind.config.js`
2. Check that the `safelist` pattern is present in the config
3. Verify that `colors` is imported from `tailwindcss/colors`

### Wrong color displaying?
1. Clear browser cache
2. Check for any hardcoded `emerald-*` classes in custom code
3. Ensure you're using `theme-*` not a direct color name

## Migration from Hardcoded Colors

If you have custom components using hardcoded colors, migrate them:

```tsx
// Before (hardcoded)
className="text-emerald-500 bg-emerald-500/10"

// After (theme system)
className="text-theme-500 bg-theme-500/10"
```

Use find-and-replace:
1. Find: `emerald-`
2. Replace: `theme-`

Then change the theme color in `tailwind.config.js` to your desired color.

## Examples

### Change to Rose
```javascript
// tailwind.config.js
theme: colors.rose,
```

### Change to Blue
```javascript
// tailwind.config.js
theme: colors.blue,
```

### Change to Purple
```javascript
// tailwind.config.js
theme: colors.purple,
```

All components will instantly use the new color across the entire application!