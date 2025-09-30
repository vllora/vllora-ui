# Ellora UI (LLM Studio UI)

A comprehensive AI model explorer and chat interface built with React TypeScript. Browse local AI models running on your machine, compare model specifications, costs, and capabilities with an intuitive interface.

## Features

- ⚛️ **React 19** with TypeScript
- 🎨 **Tailwind CSS** for styling with custom color schemes
- 🧩 **shadcn/ui** components (Dropdown Menu, Tooltip, Button)
- 🎯 **Vite** for fast development and building
- 📱 **Responsive Design** with mobile-friendly navigation
- 🎭 **Lucide React** icons
- 🧭 **React Router** for navigation
- 📊 Collapsible sidebar with smooth animations
- 🌓 **Dark Mode** support with theme toggle (Light/Dark/System)
- 🤖 **Local AI Models Explorer** - Browse and manage locally running models
- 💬 **Chat Interface** - Interactive chat with AI models
- 📋 **Advanced Filtering** - Filter by provider, type, category, cost, context size, and more
- 📈 **Model Comparison** - Compare specifications across models
- 🎨 **Multiple View Modes** - Grid and table views for model browsing
- 🔄 **Real-time Data** - Connect to local model servers (localhost:8080)

## Project Structure

```
ellora-ui/
├── src/
│   ├── components/
│   │   ├── app-sidebar.tsx              # Collapsible sidebar navigation
│   │   ├── layout.tsx                   # Main layout wrapper
│   │   ├── theme-provider.tsx           # Theme context provider
│   │   ├── mode-toggle.tsx              # Theme toggle component
│   │   ├── chat/                        # Chat interface components
│   │   │   ├── ChatWindow.tsx           # Main chat container
│   │   │   ├── ChatSidebar.tsx          # Thread list sidebar
│   │   │   ├── ChatConversation.tsx     # Message display with markdown
│   │   │   ├── ChatInput.tsx            # Input with file upload & voice
│   │   │   ├── MessageDisplay.tsx       # Markdown renderer with syntax highlighting
│   │   │   └── ModelSelector.tsx        # Two-step model selection dropdown
│   │   ├── models/                      # Model explorer components
│   │   │   ├── ModelsExplorer.tsx
│   │   │   ├── ModelCard.tsx
│   │   │   ├── NewModelsTable.tsx
│   │   │   ├── ModelSearchFilters.tsx
│   │   │   ├── FormatDropdown.tsx
│   │   │   ├── ContextSizeFilter.tsx
│   │   │   ├── local/                   # Local models components
│   │   │   │   ├── LocalModelsExplorer.tsx
│   │   │   │   ├── LocalModelCard.tsx
│   │   │   │   ├── LocalModelsTable.tsx
│   │   │   │   ├── LocalModelSearchFilters.tsx
│   │   │   │   └── LocalModelsSkeletonLoader.tsx
│   │   │   └── filter-components/       # Filter components
│   │   │       ├── ProviderFilter.tsx
│   │   │       ├── LocalProviderFilter.tsx
│   │   │       ├── TypeFilter.tsx
│   │   │       ├── CategoryFilter.tsx
│   │   │       ├── CombinedCostFilter.tsx
│   │   │       ├── CachingFilter.tsx
│   │   │       ├── PublisherFilter.tsx
│   │   │       └── OwnerFilter.tsx
│   │   ├── shared/                      # Shared components
│   │   │   ├── NewBadge.tsx
│   │   │   ├── RankingsBadge.tsx
│   │   │   └── CostDisplay.tsx
│   │   ├── Icons/
│   │   │   └── ProviderIcons.tsx
│   │   └── ui/                          # shadcn/ui components
│   │       ├── button.tsx
│   │       ├── dropdown-menu.tsx
│   │       └── tooltip.tsx
│   ├── pages/
│   │   ├── home.tsx                     # Local models gallery page
│   │   ├── chat.tsx                     # Chat interface page
│   │   ├── projects.tsx                 # Projects page
│   │   ├── analytics.tsx                # Analytics page
│   │   └── settings.tsx                 # Settings page
│   ├── hooks/                           # Custom React hooks
│   │   ├── useLocalModels.tsx           # Hook for fetching local models
│   │   ├── useChatState.ts              # Chat state management
│   │   ├── useMessageSubmission.ts      # Message submission & streaming
│   │   └── useScrollToBottom.ts         # Auto-scroll functionality
│   ├── services/                        # API services
│   │   └── models-api.ts                # Model data fetching
│   ├── config/                          # Configuration
│   │   └── api.ts                       # Centralized API configuration
│   ├── types/                           # TypeScript type definitions
│   │   └── chat.ts                      # Chat-related types
│   ├── lib/
│   │   └── utils.ts                     # Utility functions
│   ├── utils/                           # Helper utilities
│   │   └── eventEmitter.ts              # Event-driven communication
│   ├── App.tsx                          # Main app component with routing
│   ├── main.tsx                         # Application entry point
│   └── index.css                        # Global styles and theme variables
├── public/                              # Static assets
├── .env                                 # Environment variables
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
- Local AI model server running on `localhost:8080` (optional, for local models feature)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/langdb/ellora-ui.git
cd ellora-ui
```

2. Install pnpm if you haven't already:
```bash
npm install -g pnpm
```

3. Install dependencies:
```bash
pnpm install
```

4. Create a `.env` file in the root directory with your configuration:
```env
VITE_LANGDB_PROJECT_ID=your_project_id
VITE_LANGDB_API_KEY=your_api_key
VITE_LANGDB_API_URL=https://api.staging.langdb.ai
# Set to 'true' to connect to local AI gateway at http://localhost:8080/v1/chat/completions
VITE_CONNECT_LOCAL=false
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

### Local AI Models Explorer
- Browse and manage AI models running on your local machine
- Real-time connection to local model server (localhost:8080)
- View detailed model specifications including:
  - Model name, provider, and owner
  - Context size and token limits
  - Pricing information (input/output costs)
  - Model capabilities and metadata
- Advanced filtering system:
  - Filter by provider (OpenAI, Anthropic, Google, etc.)
  - Filter by model type and category
  - Filter by cost ranges
  - Search by model name or ID
  - Filter by owner and publisher
- Multiple view modes:
  - **Grid View**: Card-based layout with model details
  - **Table View**: Compact table format for quick comparison
- Real-time statistics and model counts
- Skeleton loaders for smooth loading experience
- Error handling with retry functionality

### Chat Interface
- Interactive chat interface with AI models
- **Streaming Support** - Real-time message streaming with Server-Sent Events
- **File Upload** - Attach images and audio files with drag & drop support
- **Speech Recognition** - Voice input using browser Speech Recognition API
- **Markdown Rendering** - Full markdown support with syntax highlighting for code blocks
- **Model Selection** - Two-step model selector (model name → provider)
- Thread management with conversation history
- Auto-scroll to bottom during streaming and on completion
- Integration with local and remote AI models

### Collapsible Sidebar
- Click the chevron icon to collapse/expand the sidebar
- When collapsed, only icons are visible
- Smooth transition animations
- Mobile responsive with hamburger menu

### Navigation Menu
The sidebar includes the following pages:
- **Home**: Local AI models gallery and explorer
- **Chat**: Interactive chat interface with AI models
- **Projects**: Project management (placeholder)
- **Analytics**: Usage analytics and metrics (placeholder)
- **Settings**: Application configuration (placeholder)

### Dark Mode
- Toggle between Light, Dark, and System themes
- Theme preference is persisted in localStorage
- Smooth transitions between themes
- Theme toggle button located at the bottom of the sidebar
- Custom color schemes optimized for both light and dark modes

### Responsive Design
- Desktop: Fixed sidebar with collapse functionality
- Mobile: Off-canvas sidebar with overlay backdrop
- Touch-friendly navigation
- Responsive grid layouts that adapt to screen size

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
- **Tailwind CSS** - Utility-first CSS framework with custom theming
- **shadcn/ui** - Reusable component library (Button, Dropdown Menu, Tooltip)
- **Radix UI** - Unstyled, accessible UI components
- **Lucide React** - Icon library
- **React Router DOM** - Client-side routing
- **next-themes** - Theme management system
- **framer-motion** - Animation library
- **ahooks** - React hooks library
- **date-fns** - Date utility library
- **class-variance-authority** - CSS variant management
- **tailwind-merge** - Tailwind class merging utility
- **react-markdown** - Markdown rendering for chat messages
- **react-syntax-highlighter** - Code syntax highlighting
- **react-dropzone** - Drag & drop file uploads
- **mitt** - Event emitter for component communication
- **uuid** - Unique ID generation

## Key Dependencies

```json
{
  "react": "^19.1.1",
  "typescript": "^5.9.2",
  "vite": "^7.1.7",
  "tailwindcss": "^3.4.17",
  "@radix-ui/react-dropdown-menu": "^2.1.16",
  "@radix-ui/react-tooltip": "^1.2.8",
  "lucide-react": "^0.544.0",
  "react-router-dom": "^7.9.3",
  "next-themes": "^0.4.6",
  "framer-motion": "^12.23.22"
}
```

## API Integration

This application connects to:
- **LangDB API** - For model data and chat functionality
- **Local Model Server** - For locally running AI models (localhost:8080)

## Development Notes

- The app uses custom React hooks for state management and data fetching
- Event-driven architecture using mitt for component communication
- Streaming chat with Server-Sent Events (SSE)
- Theme system uses CSS variables for easy customization
- URL state management for filter persistence
- Component-based architecture with clear separation of concerns
- TypeScript for type safety across the application
- Centralized API configuration in `/src/config/api.ts`

## License

ISC

## Contributing

Feel free to submit issues and pull requests to improve the application.