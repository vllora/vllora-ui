# AppSidebar Component

## Overview

The `AppSidebar` component provides the main navigation sidebar for the application. It features a collapsible design with glassmorphism styling and follows the shadcn theming system.

## Structure

The sidebar is divided into three main sections:

### 1. Header Section
- **Title**: "LLM Studio" (hidden when collapsed)
- **Toggle Button**: Desktop-only button to collapse/expand the sidebar
- **Mobile Menu Button**: Fixed hamburger menu button for mobile devices

### 2. Main Navigation (flex-1)
Contains primary navigation items:
- **Home** (`/`) - Home icon
- **Chat** (`/chat`) - MessageSquare icon
- **Analytics** (`/analytics`) - BarChart3 icon

### 3. Bottom Navigation (fixed at bottom)
Contains global utility navigation items, separated by a border:
- **Projects** (`/projects`) - FolderOpen icon
- **Settings** (`/settings`) - Settings icon

## States

### Collapsed State
- Width: `64px` (w-16)
- Icons only, no text labels
- Toggle button centered
- Navigation items centered

### Expanded State
- Width: `256px` (w-64)
- Shows title "LLM Studio"
- Shows navigation labels
- Toggle button aligned right

### Mobile State
- Sidebar hidden off-screen by default
- Activated via hamburger menu button (top-left)
- Overlay backdrop when open
- Closes when clicking outside or on a menu item

## Styling

### Theme Integration
- Uses CSS variables for all colors (`--background`, `--primary`, `--accent`, etc.)
- No hardcoded colors - fully adapts to the selected theme
- Works with all 11 color themes (Zinc, Slate, Stone, Neutral, Red, Rose, Orange, Green, Blue, Yellow, Violet)

### Visual Effects
- **Glassmorphism**: `backdrop-blur-xl bg-background/95`
- **Border**: Semi-transparent border on the right
- **Shadow**: `shadow-lg` for depth
- **Hover Effects**: Scale transform (`hover:scale-[1.02]`)
- **Active State**: Primary color background with increased scale

### Active State Indicators
- Background: `bg-primary text-primary-foreground`
- Icon: Slightly larger scale (`scale-110`)
- Shadow: `shadow-sm`

## Responsive Behavior

### Desktop (md and up)
- Always visible
- Collapsible via toggle button
- Fixed positioning (via `md:relative`)

### Mobile (< md breakpoint)
- Hidden by default (`-translate-x-full`)
- Opens via hamburger menu
- Full overlay backdrop
- Closes on item click or backdrop click

## Props

```typescript
interface AppSidebarProps {
  isCollapsed: boolean  // Controls collapsed/expanded state
  onToggle: () => void  // Callback when toggle button is clicked
}
```

## Usage Example

```tsx
import { AppSidebar } from "@/components/app-sidebar"

function Layout() {
  const [isCollapsed, setIsCollapsed] = useState(false)

  return (
    <div className="flex h-screen">
      <AppSidebar
        isCollapsed={isCollapsed}
        onToggle={() => setIsCollapsed(!isCollapsed)}
      />
      <main className="flex-1">
        {/* Page content */}
      </main>
    </div>
  )
}
```

## Navigation Structure Rationale

### Main Navigation
Contains primary user-facing features that are frequently accessed during regular usage:
- **Home**: Landing page / dashboard
- **Chat**: AI chat interface (core feature)
- **Analytics**: Usage metrics and insights

### Bottom Navigation (Global Menu)
Contains administrative and organizational features that are accessed less frequently:
- **Projects**: Project management and organization
- **Settings**: Application configuration

This separation creates a clear hierarchy between frequently-used features (top) and administrative/utility features (bottom), improving UX by grouping items logically.

## Dependencies

- `react-router-dom`: Navigation routing
- `lucide-react`: Icon components
- `@/lib/utils`: `cn` utility for className merging
- `@/components/ui/button`: Button component
- `@/components/mode-toggle`: Theme color picker (if integrated in footer)

## Animation and Transitions

- Sidebar width: `transition-all duration-300`
- Menu items: `transition-all duration-200`
- Icons: `transition-transform duration-200`
- Mobile sidebar: Slide in/out with transform
- Backdrop: Fade in/out