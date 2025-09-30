# Changing the Accent Color

Ellora UI currently uses **emerald** as the default accent color throughout the interface. You can easily change this to any color you prefer.

## Current Usage

The accent color (emerald) is currently hardcoded in these components:

### Core UI Components
- **AppSidebar** (`/src/components/app-sidebar.tsx`)
  - Active menu items
  - Hover states
  - Icons

- **ProjectDropdown** (`/src/components/ProjectDropdown.tsx`)
  - Folder icons
  - Selected project background
  - "New Project" text and hover state

- **ChatSidebar** (`/src/components/chat/ChatSidebar.tsx`)
  - "New Chat" button

- **Projects Page** (`/src/pages/projects.tsx`)
  - "New Project" button
  - Project folder icons
  - Card hover borders

### Model Browser Components
- Home page (`/src/pages/home.tsx`)
- Model cards and tables
- Search filters
- Cost displays

## How to Change the Accent Color

### Quick Find & Replace (Current Method)

Since the accent color is currently hardcoded, use find-and-replace:

1. **Search** for: `emerald-`
2. **Replace** with: `rose-` (or `blue-`, `purple-`, `amber-`, etc.)
3. **Files to update**: All 14 files listed above

**Example replacements:**
- `emerald-500` → `rose-500`
- `emerald-400` → `rose-400`
- `emerald-600` → `rose-600`
- `text-emerald-500` → `text-rose-500`
- `bg-emerald-500/10` → `bg-rose-500/10`
- `hover:bg-emerald-500/10` → `hover:bg-rose-500/10`
- `border-emerald-500/30` → `border-rose-500/30`

### Future: CSS Variable System (Recommended)

For easier customization, we've prepared a CSS variable system:

1. **Import the accent CSS** in your main CSS file (`/src/index.css`):
   ```css
   @import './styles/accent.css';
   ```

2. **Edit** `/src/styles/accent.css` and uncomment your preferred color:
   ```css
   /* Rose accent */
   :root {
     --accent-500: 244 63 94;
     --accent-600: 225 29 72;
     /* ... */
   }
   ```

3. **Update components** to use CSS variables instead of hardcoded colors:
   ```tsx
   // Before
   className="text-emerald-500"

   // After
   className="text-[rgb(var(--accent-500))]"
   ```

4. **Or use the utility helper** (`/src/lib/accent.ts`):
   ```tsx
   import { accent } from '@/lib/accent';

   className={accent.text}
   className={accent.bg.subtle}
   className={accent.hover.bg}
   ```

## Available Color Presets

Presets available in `/src/styles/accent.css`:

- **Emerald** (default) - `#22c55e`
- **Rose** - `#f43f5e`
- **Blue** - `#3b82f6`
- **Purple** - `#a855f7`
- **Amber** - `#f59e0b`

You can also define custom RGB values for any color.

## Migration Guide

To migrate from hardcoded colors to CSS variables:

1. Replace `emerald-500` → `[rgb(var(--accent-500))]`
2. Replace `emerald-400` → `[rgb(var(--accent-400))]`
3. Replace `emerald-600` → `[rgb(var(--accent-600))]`
4. For opacity: `emerald-500/10` → `[rgb(var(--accent-500))]/10`

**Example:**
```tsx
// Before
<div className="text-emerald-600 dark:text-emerald-400 bg-emerald-500/10">

// After
<div className="text-[rgb(var(--accent-600))] dark:text-[rgb(var(--accent-400))] bg-[rgb(var(--accent-500))]/10">
```

## Common Accent Color Usages

- **Active states**: Sidebar menu items, selected projects
- **Hover effects**: Buttons, cards, menu items
- **Icons**: Folder icons, plus icons
- **Text highlights**: "New Project", "New Chat" buttons
- **Borders**: Card hovers, dropdown items
- **Backgrounds**: Subtle tints (10-20% opacity)

## Notes

- The accent color should have good contrast in both light and dark modes
- Use lighter shades (400, 300) for dark mode
- Use darker shades (600, 700) for light mode
- Maintain consistent opacity levels:
  - `10%` for subtle backgrounds
  - `20%` for hover states
  - `30-50%` for borders