# Ellora - AI Gateway Desktop App

A comprehensive desktop application for exploring AI models and interacting with them through a beautiful chat interface. Built with React, TypeScript, Tauri, and a Rust-based AI Gateway backend.

## Installation

### Quick Install (macOS Apple Silicon)

```bash
# Using shell script
curl -fsSL https://raw.githubusercontent.com/langdb/ellora-ui/main/install.sh | bash

# Or using npx (after npm publish)
npx @ellora/installer
```

### Manual Installation

Download the latest DMG from [Releases](https://github.com/YOUR_ORG/ellora-ui/releases/latest) and see [INSTALLATION.md](./INSTALLATION.md) for detailed instructions.

> **📖 For development setup and build instructions, see [BUILD.md](./BUILD.md)**

## Overview

Ellora combines a React TypeScript frontend with a Tauri desktop wrapper and a powerful Rust AI Gateway backend to provide:
- **Native Desktop Experience** - Cross-platform app (macOS, Windows, Linux) built with Tauri
- **AI Gateway Backend** - Rust-based API server with support for multiple AI providers
- **Dynamic Port Management** - Automatic port allocation to avoid conflicts
- **Local Model Management** - Browse and manage AI models running on your machine
- **Chat Interface** - Real-time streaming chat with AI models

## Architecture

```
┌─────────────────────────────────────────┐
│         Ellora Desktop App              │
│  ┌───────────────────────────────────┐  │
│  │   React Frontend (Vite)           │  │
│  │   - UI Components                 │  │
│  │   - Chat Interface                │  │
│  │   - Model Explorer                │  │
│  └───────────────────────────────────┘  │
│  ┌───────────────────────────────────┐  │
│  │   Tauri (Rust)                    │  │
│  │   - Window Management             │  │
│  │   - Backend Lifecycle             │  │
│  │   - IPC Communication             │  │
│  └───────────────────────────────────┘  │
│  ┌───────────────────────────────────┐  │
│  │   AI Gateway (Rust)               │  │
│  │   - Multi-provider Support        │  │
│  │   - Streaming API                 │  │
│  │   - Dynamic Port (8080-8090)      │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
```

## Features

### Frontend
- ⚛️ **React 19** with TypeScript
- 🎨 **Tailwind CSS** with custom color schemes
- 🧩 **shadcn/ui** components
- 🎯 **Vite** for fast development
- 📱 **Responsive Design**
- 🌓 **Dark Mode** support
- 🧭 **React Router** navigation
- 📊 Collapsible sidebar with animations

### Desktop App
- 🖥️ **Tauri** - Native desktop wrapper
- 🔧 **Cross-platform** - macOS, Windows, Linux
- ⚡ **Native Performance** - Rust backend
- 🔌 **Dynamic Port Allocation** - Auto-finds available ports
- 🎯 **Window Management** - Shows only when backend ready

### AI Gateway Backend
- 🦀 **Rust** - High-performance backend
- 🔄 **Multi-provider Support** - OpenAI, Anthropic, Google, AWS Bedrock, etc.
- 📡 **Streaming API** - Real-time message streaming
- 🔑 **Credential Management** - Secure API key storage
- 💾 **Database Integration** - SQLite for local storage
- 📊 **Usage Tracking** - Cost and token tracking

### Application Features
- 🤖 **Local AI Models Explorer** - Browse and manage models
- 💬 **Chat Interface** - Interactive chat with streaming
- 📋 **Advanced Filtering** - Filter by provider, type, cost, etc.
- 📈 **Model Comparison** - Compare specifications
- 🎨 **Multiple View Modes** - Grid and table views
- 🔄 **Real-time Updates** - Live model data

## Project Structure

```
ellora-ui/
├── src/                                 # React Frontend
│   ├── components/                      # React components
│   │   ├── chat/                        # Chat interface components
│   │   ├── models/                      # Model explorer components
│   │   ├── ui/                          # shadcn/ui components
│   │   └── ...
│   ├── pages/                           # Page components
│   │   ├── home.tsx                     # Local models gallery
│   │   ├── chat.tsx                     # Chat interface
│   │   ├── projects.tsx                 # Projects management
│   │   ├── analytics.tsx                # Analytics dashboard
│   │   └── settings.tsx                 # Settings page
│   ├── contexts/                        # React Context providers
│   ├── hooks/                           # Custom React hooks
│   ├── services/                        # API services
│   │   ├── models-api.ts                # Model data fetching
│   │   ├── projects-api.ts              # Project operations
│   │   └── providers-api.ts             # Provider management
│   ├── config/
│   │   └── api.ts                       # API config with dynamic port
│   ├── types/                           # TypeScript definitions
│   ├── App.tsx                          # Main app with routing
│   └── main.tsx                         # Entry point
├── src-tauri/                           # Tauri Desktop App (Rust)
│   ├── src/
│   │   ├── lib.rs                       # Main Tauri logic
│   │   │                                # - Dynamic port allocation
│   │   │                                # - Backend lifecycle management
│   │   │                                # - Window visibility control
│   │   └── main.rs                      # Tauri entry point
│   ├── tauri.conf.json                  # Tauri configuration
│   │                                    # - Window settings
│   │                                    # - Resource bundling
│   │                                    # - Build commands
│   ├── Cargo.toml                       # Rust dependencies
│   └── icons/                           # App icons
├── ai-gateway/                          # AI Gateway Backend (Git Submodule)
│   ├── gateway/                         # Main gateway service
│   ├── core/                            # Core types and utilities
│   ├── guardrails/                      # AI safety features
│   ├── .env                             # API keys (create from .env.example)
│   ├── config.yaml                      # Server config (create from sample)
│   └── target/release/
│       └── ai-gateway                   # Compiled binary (bundled in app)
├── dist/                                # Built frontend (generated)
├── docs/                                # Documentation
│   ├── state-management-pattern.md      # State management guide
│   └── changing-accent-color.md         # Theme customization
├── BUILD.md                             # Complete build guide
├── README.md                            # This file
├── .gitmodules                          # Git submodule config
├── package.json                         # npm scripts and dependencies
├── vite.config.ts                       # Vite configuration
├── tsconfig.json                        # TypeScript configuration
└── tailwind.config.js                   # Tailwind CSS configuration
```

**Key Directories:**
- `src/` - React frontend application
- `src-tauri/` - Tauri desktop wrapper (Rust)
- `ai-gateway/` - Backend API server (Git submodule, Rust)
- `dist/` - Compiled frontend (bundled into Tauri app)

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm 8+
- Rust (for Tauri desktop app)
- Git

### Installation

```bash
# Clone repository
git clone https://github.com/langdb/ellora-ui.git
cd ellora-ui

# Initialize submodules (ai-gateway backend)
git submodule update --init --recursive

# Setup backend configuration
cd ai-gateway
cp .env.example .env
cp config.sample.yaml config.yaml
# Edit .env and config.yaml with your settings
cd ..

# Install dependencies
pnpm install
```

### Development

**Frontend only:**
```bash
pnpm dev  # Starts Vite dev server at http://localhost:5173
```

**Backend only:**
```bash
pnpm start:backend  # Starts ai-gateway on port 8080
```

**Full desktop app:**
```bash
pnpm tauri:dev  # Starts complete Tauri app with backend
```

### Building

**Frontend only:**
```bash
pnpm build  # Outputs to dist/
```

**Complete desktop app:**
```bash
pnpm build-app  # Builds backend + frontend + Tauri app
```

> **📖 For detailed build process, configuration, and troubleshooting, see [BUILD.md](./BUILD.md)**

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

### Desktop & Backend
- **Tauri 2.x** - Native desktop app framework (Rust)
- **Rust** - Backend language for Tauri and AI Gateway
- **AI Gateway** - Custom Rust-based API server
  - Multi-provider AI integration
  - SQLite database
  - Streaming API support
  - Dynamic port allocation

### Frontend
- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Utility-first CSS framework
- **shadcn/ui** - Component library
- **Radix UI** - Accessible UI primitives
- **React Router DOM** - Client-side routing
- **next-themes** - Theme management

### UI & UX
- **Lucide React** - Icon library
- **framer-motion** - Animation library
- **sonner** - Toast notifications
- **react-markdown** - Markdown rendering
- **react-syntax-highlighter** - Code syntax highlighting
- **react-dropzone** - File upload

### State Management & Utilities
- **ahooks** - React hooks for data fetching
- **mitt** - Event emitter
- **date-fns** - Date utilities
- **uuid** - Unique ID generation
- **class-variance-authority** - CSS variants
- **tailwind-merge** - Class merging

## System Architecture

```
User Interface (React)
        ↕ (Fetch API)
Tauri IPC Layer (get_backend_port)
        ↕
AI Gateway (Rust)
        ↕
External AI Providers
(OpenAI, Anthropic, Google, etc.)
```

**Data Flow:**
1. User interacts with React UI
2. UI calls AI Gateway API (dynamic port via Tauri IPC)
3. AI Gateway routes requests to appropriate provider
4. Responses stream back through gateway to UI
5. UI displays real-time results

## Documentation

- **[BUILD.md](./BUILD.md)** - Complete build process, configuration, and troubleshooting guide
- **[State Management Pattern](./docs/state-management-pattern.md)** - Guide for Context API + ahooks pattern
- **[Changing Accent Color](./docs/changing-accent-color.md)** - Theme customization guide

## Development Notes

### Architecture Patterns
- **Tauri IPC** - Communication between frontend and Rust backend
- **Dynamic Port Allocation** - Automatic port discovery (8080-8090) to avoid conflicts
- **Window Lifecycle** - Window shows only after backend health check succeeds
- **Git Submodules** - ai-gateway tracked as submodule on `feat/oss-refactor` branch

### Frontend Patterns
- **React Context + ahooks** - Server state management
- **Event-driven architecture** - Using mitt for component communication
- **Streaming chat** - Server-Sent Events (SSE) for real-time responses
- **Dynamic API URLs** - Backend port fetched via Tauri IPC at runtime
- **URL state** - Filter persistence in query parameters
- **Theme system** - CSS variables for customization
- **TypeScript** - Type safety across application

### Backend Integration
- **Configuration files** - Separate `.env` for frontend and backend
- **Resource bundling** - Backend binary and config files bundled in production
- **Working directory** - Set correctly for both dev and production modes
- **Health checks** - Backend readiness polling before window display

### Key Files
- `src-tauri/src/lib.rs` - Tauri app logic, port allocation, backend lifecycle
- `src/config/api.ts` - Dynamic API configuration with port fetching
- `ai-gateway/.env` - Backend API keys (gitignored, create from .env.example)
- `ai-gateway/config.yaml` - Backend server configuration
- `.gitmodules` - Submodule configuration for ai-gateway

## License

ISC

## Contributing

Feel free to submit issues and pull requests to improve the application.