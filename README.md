# LLM Studio UI

A modern React TypeScript application with a collapsible sidebar navigation built with shadcn/ui components, Tailwind CSS, and Lucide React icons.

## Features

- ⚛️ **React 19** with TypeScript
- 🎨 **Tailwind CSS** for styling
- 🧩 **shadcn/ui** components
- 🎯 **Vite** for fast development and building
- 📱 **Responsive Design** with mobile-friendly navigation
- 🎭 **Lucide React** icons
- 🧭 **React Router** for navigation
- 📊 Collapsible sidebar with smooth animations
- 🌓 **Dark Mode** support with theme toggle (Light/Dark/System)

## Project Structure

```
llm-studio-ui/
├── src/
│   ├── components/
│   │   ├── app-sidebar.tsx    # Collapsible sidebar component
│   │   ├── layout.tsx          # Main layout wrapper
│   │   └── ui/
│   │       └── button.tsx      # shadcn/ui button component
│   ├── pages/
│   │   ├── home.tsx            # Home page
│   │   ├── chat.tsx            # Chat page
│   │   ├── projects.tsx        # Projects page
│   │   ├── analytics.tsx       # Analytics page
│   │   └── settings.tsx        # Settings page
│   ├── lib/
│   │   └── utils.ts            # Utility functions
│   ├── App.tsx                 # Main app component with routing
│   ├── main.tsx                # Application entry point
│   └── index.css               # Global styles and Tailwind imports
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
└── postcss.config.js
```

## Prerequisites

- Node.js 18+
- pnpm 8+

## Installation

1. Clone the repository:
```bash
git clone https://github.com/langdb/llm-studio-ui.git
cd llm-studio-ui
```

2. Install pnpm if you haven't already:
```bash
npm install -g pnpm
```

3. Install dependencies:
```bash
pnpm install
```

## Development

To start the development server:

```bash
pnpm dev
```

The application will be available at `http://localhost:5173` (or another port if 5173 is busy).

## Building for Production

To create a production build:

```bash
pnpm build
```

The build output will be in the `dist` directory.

To preview the production build locally:

```bash
pnpm preview
```

## Features Overview

### Collapsible Sidebar
- Click the chevron icon to collapse/expand the sidebar
- When collapsed, only icons are visible
- Smooth transition animations
- Mobile responsive with hamburger menu

### Navigation Menu
The sidebar includes the following pages:
- **Home**: Dashboard overview
- **Chat**: LLM chat interface
- **Projects**: Project management
- **Analytics**: Usage analytics and metrics
- **Settings**: Application configuration

### Dark Mode
- Toggle between Light, Dark, and System themes
- Theme preference is persisted in localStorage
- Smooth transitions between themes
- Theme toggle button located at the bottom of the sidebar

### Responsive Design
- Desktop: Fixed sidebar with collapse functionality
- Mobile: Off-canvas sidebar with overlay backdrop
- Touch-friendly navigation

## Customization

### Adding New Pages

1. Create a new page component in `src/pages/`:
```tsx
export function NewPage() {
  return (
    <div>
      <h1>New Page</h1>
    </div>
  )
}
```

2. Add the route in `src/App.tsx`:
```tsx
<Route path="new-page" element={<NewPage />} />
```

3. Add menu item in `src/components/app-sidebar.tsx`:
```tsx
const menuItems = [
  // ... existing items
  { id: "new", label: "New Page", icon: IconName, path: "/new-page" },
]
```

### Styling

The application uses Tailwind CSS with custom shadcn/ui theme variables. You can customize colors and theme in:
- `src/index.css` - CSS variables and global styles
- `tailwind.config.js` - Tailwind configuration

## Technology Stack

- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Utility-first CSS framework
- **shadcn/ui** - Reusable component library
- **Lucide React** - Icon library
- **React Router DOM** - Client-side routing

## License

ISC

## Contributing

Feel free to submit issues and pull requests.