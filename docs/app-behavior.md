# Ellora UI - Project Behavior Documentation

## Overview

Ellora UI is a modern web interface (frontend) for interacting with AI models through the LangDB AI Gateway (backend). It provides a comprehensive platform for browsing models, managing conversations, and organizing projects.

**Repository Structure**:
- **Frontend**: `ellora-ui` (this repository) - React + TypeScript web application
- **Backend**: `ai-gateway` - Rust-based AI Gateway server

The frontend connects to the backend API running locally at `http://0.0.0.0:8080`.

## Application Behavior Model

### Project-Centric Architecture

Ellora UI operates on a **project-centric model** where all activities are scoped to a specific project:

1. **Default Project**: When a user starts the application, a default project always exists
2. **Project Context in URL**: All project-scoped pages include project ID in the URL path:
   - Home (Model Browser): `/project/{projectId}`
   - Chat: `/project/{projectId}/chat`
   - Analytics: `/project/{projectId}/analytics`
3. **Project Context**: All features operate within the current project context:
   - Models list - shows models available to the current project
   - Chat conversations - stored per project
   - Traces - scoped to the current project
   - Analytics - displays metrics for the current project
4. **Multi-Project Support**: Users can create unlimited projects to organize their work
5. **Project Switching**: Switching projects updates URL and refreshes all contextual data (models, chats, traces, analytics)

### Navigation Structure Rationale

The application has a dual-navigation system:

#### Header (Top Bar)
- **Project Dropdown**: Persistent project context switcher
  - Shows current project name with FolderOpen icon
  - Quick switch between all projects via dropdown
  - "All Projects" link navigates to full project management page
  - "+ New Project" button for quick project creation
  - **Hidden on Projects page** - Not needed when managing projects
  - Stores current project in localStorage for persistence
  - Auto-loads default/last selected project on app startup

#### Sidebar (Left Panel)
The sidebar is always visible and organized into two distinct sections:

**Main Navigation (Top)** - Features that operate **within the current project context**:
- **Home**: Browse models available in current project
- **Chat**: Conversations scoped to current project
- **Analytics**: Metrics and usage for current project

**Global Navigation (Bottom)** - Cross-project management and settings:
- **Projects**: Full project management page
  - Create, view, and delete projects
  - See project metadata and timestamps
  - Default project indicator (yellow star)
  - Highlighted when active (emerald gradient)
- **Global Config**: Application-wide settings
  - Theme preferences, API configuration, user preferences
  - Settings apply to all projects

This separation creates a clear mental model:
- **Header dropdown** = "Quick project switching while working"
- **Sidebar top menu** = "What can I do in this project?"
- **Sidebar bottom menu** = "Manage projects and configure the application"

**Key Behaviors**:
- Header hides on `/projects` page for maximum space
- All sidebar items remain visible on all pages for consistent navigation
- Default project automatically selected on app load (redirects to `/project/{projectId}`)
- Project context persists in URL path and localStorage
- Shareable URLs: Copy URL to share specific project view with others
- Browser history: Back/forward buttons work intuitively with project context

## Core Architecture

### Technology Stack
- **Framework**: React 18 + TypeScript
- **Routing**: React Router v6
- **Styling**: Tailwind CSS + shadcn/ui components
- **Build Tool**: Vite
- **State Management**: React hooks (useState, useCallback, useEffect)
- **UI Components**: Radix UI primitives via shadcn/ui

### Project Structure
```
ellora-ui/
├── src/
│   ├── components/        # Reusable UI components
│   │   ├── chat/         # Chat-specific components
│   │   ├── models/       # Model browser components
│   │   └── ui/           # shadcn/ui components
│   ├── config/           # Configuration files
│   ├── hooks/            # Custom React hooks
│   ├── pages/            # Page-level components
│   ├── services/         # API service layers
│   ├── themes/           # Theme definitions
│   ├── types/            # TypeScript type definitions
│   └── utils/            # Utility functions
├── documents/            # Project documentation
└── public/              # Static assets
```

## Key Features

### 1. Header Component

**Location**: `/src/components/Header.tsx`

**Purpose**: Persistent top bar for project context management

**Features**:
- **Project Dropdown**:
  - Displays current project name with FolderOpen icon
  - Quick project switching via dropdown menu
  - Lists all projects with descriptions and "Default" badge
  - "All Projects" link to full project management page (`/projects`)
  - "+ New Project" button (emerald color) with link to `/projects?action=create`
  - Stores selection in localStorage for persistence
  - Auto-selects default project on initial load (handled by Layout)
- **Visibility**:
  - Hidden on `/projects` page (returns `null`) to maximize space
  - Visible on all other pages (Home, Chat, Analytics, Settings)
- Sticky positioning (always visible when scrolling)
- Glassmorphism styling with backdrop blur
- Height: 64px (h-16) for consistency

**API Integration**: Uses `/src/services/projects-api.ts` via ProjectDropdown component

### 2. Navigation Sidebar

**Location**: `/src/components/app-sidebar.tsx`

**Behavior**:
- Always visible on all pages
- Collapsible design (expanded: 256px, collapsed: 64px)
- Two navigation sections with distinct purposes:

  **Main Navigation (Top)** - Project-scoped features:
  - **Home**: Browse models available in the current project
  - **Chat**: Access conversations within the current project
  - **Analytics**: View metrics and usage for the current project

  **Global Navigation (Bottom)** - Cross-project management and settings:
  - **Projects**: Full project management page
    - Navigate to `/projects` to view all projects
    - Create, edit, delete projects
    - View project metadata and timestamps
    - Highlighted with emerald gradient when active
  - **Global Config**: Application-wide settings
    - Theme preferences, API configuration, user preferences
    - Located in bottom menu because settings apply globally to all projects
    - Changes affect the entire application, not just the current project

- Active menu items highlighted with emerald gradient
- Tooltips show labels when collapsed
- Mobile-responsive with hamburger menu and overlay
- Glassmorphism styling with backdrop blur

**Design Rationale**:
- **Always visible**: Provides consistent navigation across all pages
- **Header dropdown**: Quick project switching without leaving current page
- **Sidebar Projects menu**: Navigate to full project management interface
- **Sidebar top menu (context-dependent)**: Features that operate within the selected project
- **Sidebar bottom menu (global)**: Cross-project management and application configuration
- Creates clear separation between "working in a project" vs "managing projects and settings"

### 3. Chat Interface

**Location**: `/src/pages/chat.tsx`, `/src/components/chat/`

**Components**:
- `ChatPageSidebar` - Thread list with "New Chat" button
- `ChatWindow` - Main conversation area
- `ChatRightSidebar` - Collapsible traces panel
- `ChatConversation` - Message display with markdown rendering
- `ChatInput` - Input field with file upload and voice recording
- `ModelSelector` - Two-step model selection (model name → provider)

**Behavior**:

#### Thread Management
- Each thread has unique ID, title, model, messages, timestamps
- Threads stored in component state (could be persisted to backend)
- Selecting a thread loads its messages and model
- Delete thread with trash icon (appears on hover)

#### Message Handling
- User messages: Muted background with subtle border
- Assistant messages: Secondary background with markdown rendering
- Avatar indicators:
  - User: Muted gray circle with User icon
  - Assistant: Primary color (20% opacity) with Bot icon
- Multimodal support: Images and audio files
- Files converted to base64 before API submission
- OpenAI-compatible message format with content arrays

#### Streaming
- Server-Sent Events (SSE) for real-time streaming
- Typing indicator with animated dots while loading
- Auto-scroll to bottom on new messages and completion

#### File Upload
- Drag & drop or click to upload
- Supported: Images (preview shown) and audio files
- Files stored as base64 in message content
- Image format: `{type: "image_url", image_url: {url: "data:..."}}`
- Audio format: `{type: "input_audio", audio: {data: base64, format: "mp3"}}`

#### Traces Sidebar
- Shows execution traces for current thread
- Collapsible (48px collapsed, 320px expanded)
- Displays: timestamp, duration, trace type (request/response/tool_call/system)
- Expandable trace items with JSON details
- Color-coded icons:
  - Blue: Requests
  - Emerald: Responses
  - Yellow: Tool calls
  - Gray: System events

### 4. Model Browser (Home Page)

**Location**: `/src/pages/home.tsx`, `/src/components/models/`

The Home page serves as the Model Browser, displaying all available AI models from the AI Gateway.

**Key Features**:
- Displays all models from `GET /v1/models` endpoint
- Grid and list view modes with URL persistence
- Search and filter capabilities
- Copy model ID and provider to clipboard
- Loading states with skeleton loaders
- Error handling with retry functionality

**For detailed documentation**, see: [`/documents/home-page.md`](./home-page.md)

**Quick Reference**:
- **Endpoint**: `GET http://0.0.0.0:8080/v1/models`
- **Backend Handler**: `list_gateway_models` in `ai-gateway/core/src/handler/models.rs`
- **Custom Hook**: `useLocalModels` for data fetching
- **Response Format**: OpenAI-compatible model list with `id`, `object`, `created`, `owned_by`

**Note**: Currently shows all gateway models. Project-based model filtering is a planned feature.

### 5. API Integration

**Location**: `/src/services/`

#### Models API (`models-api.ts`)
```typescript
fetchModels()        // Fetch from LangDB Cloud API
fetchLocalModels()   // Fetch from local AI Gateway
getApiConfig()       // Get current API configuration
```

#### Projects API (`projects-api.ts`)
```typescript
listProjects()                              // GET /projects
getProject(projectId)                       // GET /projects/{id}
createProject(request)                      // POST /projects
updateProject(projectId, request)           // PUT /projects/{id}
deleteProject(projectId)                    // DELETE /projects/{id}
```

**Configuration**: `/src/config/api.ts`
```typescript
export const LOCAL_API_URL = 'http://0.0.0.0:8080';

export const API_CONFIG = {
  url: VITE_LANGDB_API_URL || LOCAL_API_URL,
  apiKey: VITE_LANGDB_API_KEY,
  projectId: VITE_LANGDB_PROJECT_ID,
  connectLocal: VITE_CONNECT_LOCAL === 'true',
  localApiUrl: LOCAL_API_URL,
};
```

### 6. Message Display & Markdown

**Location**: `/src/components/chat/MessageDisplay.tsx`

**Features**:
- Full markdown support via `react-markdown`
- Syntax highlighting for code blocks (using `react-syntax-highlighter`)
- Tables, lists, headings, links
- JSON viewer for structured data
- External links open in new tab
- Custom styling for inline code
- Math rendering support
- Responsive code blocks with scrolling

**Plugins**:
- `remark-gfm` - GitHub Flavored Markdown
- `remark-flexible-paragraphs` - Better paragraph handling
- `rehype-raw` - Raw HTML support
- `rehype-external-links` - External link handling

### 7. Custom Hooks

**Location**: `/src/hooks/`

#### `useChatState`
- Manages chat messages, input, typing state, errors
- Thread ID management
- Message history

#### `useMessageSubmission`
- Handles message submission to API
- SSE streaming response handling
- File processing and base64 conversion
- Auto-scroll management
- Terminate chat functionality

#### `useLocalModels`
- Fetches models from local AI Gateway
- Loading, error, and data states
- Refetch capability

### 8. Component Documentation

**Location**: `/src/components/app-sidebar.md`

- Detailed documentation for AppSidebar component
- Structure, states, styling, responsive behavior
- Props interface and usage examples
- Navigation structure rationale

## Design Patterns

### 1. Theme-First Design
- No hardcoded colors - all components use CSS variables
- Themes switch instantly via JavaScript CSS variable injection
- Semantic color tokens for consistency

### 2. Component Composition
- Small, focused components with single responsibility
- Props drilling minimized via context where appropriate
- Reusable UI components from shadcn/ui

### 3. Type Safety
- Strict TypeScript throughout
- Interface definitions for all data structures
- Type guards for runtime safety

### 4. Event-Driven Architecture
- `mitt` event emitter for cross-component communication
- Events: `langdb_input_fileAdded`, `langdb_clearChat`, `langdb_chat_scrollToBottom`
- Decoupled components communicate via events

### 5. API Service Layer
- Centralized API calls in service files
- Consistent error handling
- Request/response type definitions
- Easy to mock for testing

## State Management Strategy

### Local State (useState)
- Component-specific UI state
- Form inputs
- Modal visibility

### Callbacks (useCallback)
- Event handlers passed as props
- Memoized to prevent unnecessary re-renders

### Effects (useEffect)
- Data fetching
- Event subscriptions
- Cleanup logic
- Side effects synchronization

### No Global State Library
- React hooks sufficient for current complexity
- Could add Zustand/Jotai if needed for larger scale

## Styling Approach

### Tailwind CSS
- Utility-first approach
- Responsive design with breakpoint prefixes (`md:`, `lg:`)
- Custom configuration in `tailwind.config.js`

### shadcn/ui
- Pre-built accessible components
- Customizable via CSS variables
- Copy-paste approach (components owned by project)

### Glassmorphism
- `backdrop-blur-xl` for glass effect
- Semi-transparent backgrounds (`bg-background/95`)
- Subtle borders and shadows

### Animations
- Tailwind transitions (`transition-all duration-200`)
- Hover states (`hover:scale-[1.02]`)
- Loading animations (bounce, pulse)

## Error Handling

### API Errors
- Try-catch blocks in service layer
- User-friendly error messages
- Retry mechanisms for transient failures
- Error state displayed in UI

### Form Validation
- Client-side validation before submission
- Required field checks
- Format validation (UUID, email, etc.)

### Edge Cases
- Empty states with helpful messaging
- Loading states with skeletons
- Graceful degradation when APIs unavailable

## Performance Considerations

### Code Splitting
- Lazy loading pages via React Router
- Dynamic imports for large dependencies

### Memoization
- `useCallback` for event handlers
- `useMemo` for expensive computations (when needed)

### Debouncing
- Search inputs debounced
- Auto-scroll throttled

### Asset Optimization
- SVG icons via lucide-react
- Optimized images
- Minimal external dependencies

## Security Considerations

### API Keys
- Stored in environment variables
- Not exposed in client-side code
- Optional API key header

### CORS
- AI Gateway configured with permissive CORS for local development
- Should be restricted in production

### Input Sanitization
- Markdown rendering via safe libraries
- No `dangerouslySetInnerHTML` without sanitization

## Project Management Flow

### Initial Application State
1. User opens Ellora UI (navigates to `/`)
2. Backend ensures a default project exists (via database initialization)
3. **Layout component** automatically loads default project on mount:
   - Checks localStorage for `currentProjectId`
   - If found, redirects to `/project/{storedProjectId}`
   - If not found, fetches all projects and selects default (or first available)
   - Stores selected project ID in localStorage
   - Redirects to `/project/{defaultProjectId}`
4. URL now shows: `/project/{projectId}` (Home page with project context)
5. Header dropdown shows the current project name
6. All features (Home, Chat, Analytics) load data for the selected project from URL

### Creating a New Project

**Method 1: Via Header Dropdown (Quick Create)**
1. User clicks "+ New Project" in the project dropdown
2. Navigates to `/projects?action=create`
3. Dialog opens automatically with create form

**Method 2: Via Projects Page**
1. User clicks **Projects** in sidebar bottom menu
2. Navigates to `/projects` page (header hides for maximum space)
3. Projects page displays:
   - Grid of all projects with metadata (name, description, timestamps)
   - Default project indicator (yellow star)
   - "New Project" button (emerald gradient)
   - Delete button (appears on hover)
4. User clicks "New Project" button
5. Dialog opens with fields: name (required), description (optional)
6. On submit:
   - Backend creates project via `POST /projects`
   - Project list refreshes
   - New project appears in grid

### Switching Between Projects

**Method 1: Quick Switch (Header Dropdown)**
1. User clicks on **Project Dropdown** in the header (any page except `/projects`)
2. Selects a different project from the dropdown menu
3. Application updates current project context:
   - Layout's `handleProjectChange` is called
   - Stores selection in localStorage
   - Navigates to same page but with new project ID in URL
   - Example: `/project/abc-123/chat` → `/project/xyz-789/chat`
4. URL updates with new project ID
5. Header shows new project name
6. All project-scoped data refreshes automatically based on new URL parameter

**Method 2: From Projects Page**
1. User navigates to **Projects** page via sidebar (`/projects`)
2. Clicks on a project card to view details (future feature)
3. Can switch projects via header dropdown after navigating to project-scoped page

**Method 3: Direct URL**
1. User types or pastes URL with project ID: `/project/{projectId}/chat`
2. Application loads that project and page directly
3. Project ID stored in localStorage for future sessions

**Data Refresh on Project Switch**:
- URL updates with new project ID
- React Router triggers re-render with new params
- Models list reloads
- Chat threads reload
- Analytics recalculates
- Traces filter to new project

### Project Persistence
- Current project ID stored in:
  - **URL path**: `/project/{projectId}/*` (primary source of truth)
  - **localStorage**: `currentProjectId` key for fallback and restoration
- On app mount, Layout component:
  1. Reads `projectId` from URL params via React Router
  2. If URL has projectId, uses that (no redirect needed)
  3. If URL has no projectId (e.g., visiting `/`), checks localStorage
  4. If localStorage has saved projectId, redirects to `/project/{projectId}`
  5. If no saved project, fetches projects and redirects to `/project/{defaultProjectId}`
  6. Saves selection to localStorage for future sessions
- **Benefits of URL-based persistence**:
  - Shareable URLs with project context
  - Browser back/forward navigation works correctly
  - Bookmarkable project-specific pages
  - Deep linking support

### Settings vs Project Configuration
- **Settings (Global)**: Apply to entire application
  - Theme selection (affects all projects)
  - API endpoints configuration
  - User preferences (language, notifications)
- **Project Settings**: Specific to each project (future feature)
  - Model access permissions
  - Usage limits per project
  - Project-specific guardrails

## Future Enhancements

### Potential Features
- User authentication and authorization
- Project-based access control and sharing
- Project settings page (model permissions, limits)
- Chat history persistence in database (currently in memory)
- Export conversations per project
- Advanced trace filtering and search
- Real-time collaboration within projects
- Custom model fine-tuning UI per project
- Analytics dashboard with detailed charts
- Project templates for quick setup
- Project archiving/soft delete
- Project context indicator in UI header

### Technical Debt
- Add unit tests (Vitest)
- Add E2E tests (Playwright)
- Implement update method in projects API
- Add error boundaries
- Improve accessibility (ARIA labels, keyboard navigation)
- Add loading states to all async operations
- Implement proper logging/monitoring
- Implement project switching confirmation if unsaved changes
- Add project context provider for cleaner state management

## Development Workflow

### Local Development
```bash
npm install           # Install dependencies
npm run dev          # Start dev server (http://localhost:5173)
npm run build        # Production build
npm run preview      # Preview production build
```

### Environment Variables
Create `.env.local`:
```
VITE_LANGDB_API_URL=http://0.0.0.0:8080
VITE_LANGDB_API_KEY=your-api-key
VITE_LANGDB_PROJECT_ID=your-project-id
VITE_CONNECT_LOCAL=true
```

### Code Style
- Prettier for formatting
- ESLint for linting
- TypeScript strict mode

## Integration with AI Gateway Backend

### Backend Repository
**Location**: `/Users/anhthuduong/Documents/GitHub/ai-gateway`

The AI Gateway is a Rust-based proxy server that provides:
- OpenAI-compatible API endpoints
- Multi-provider support (OpenAI, Anthropic, local models, etc.)
- Cost tracking and usage limits
- Guardrails and content filtering
- Trace logging and observability
- Project management

### Local Setup
1. **Start AI Gateway backend**:
   ```bash
   cd /Users/anhthuduong/Documents/GitHub/ai-gateway
   cargo run  # or docker compose up
   ```
   Gateway runs on `http://0.0.0.0:8080`

2. **Start Ellora UI frontend**:
   ```bash
   cd /Users/anhthuduong/Documents/GitHub/ellora-ui
   npm run dev
   ```
   Frontend runs on `http://localhost:5173`

3. Ellora UI connects to AI Gateway via `LOCAL_API_URL`

### Backend API Endpoints

#### Gateway Routes (`/v1/`)
Defined in `ai-gateway/gateway/src/http.rs`:
- `POST /v1/chat/completions` - Chat completions with streaming (OpenAI-compatible)
- `GET /v1/models` - List available models across all providers
- `POST /v1/embeddings` - Generate embeddings
- `POST /v1/images/generations` - Image generation

#### Projects Routes (`/projects`)
Defined in `ai-gateway/gateway/src/handlers/projects.rs`:
- `GET /projects` - List all projects (handler: `list_projects`)
- `POST /projects` - Create new project (handler: `create_project`)
- `GET /projects/{id}` - Get project by ID (handler: `get_project`)
- `PUT /projects/{id}` - Update project (handler: `update_project` - not fully implemented)
- `DELETE /projects/{id}` - Delete project (handler: `delete_project`)

#### Project Management Details
- Uses PostgreSQL database via `langdb_metadata::pool::DbPool`
- Service layer: `ProjectServiceImpl` from `langdb_metadata::services::project`
- Owner-based access control (uses `Uuid::nil()` for now, auth pending)
- Projects have: `id`, `name`, `description`, `settings`, `owner_id`, `is_default`, timestamps

### Backend Architecture
```
ai-gateway/
├── gateway/
│   ├── src/
│   │   ├── http.rs              # HTTP server setup, route configuration
│   │   ├── handlers/
│   │   │   └── projects.rs      # Project CRUD handlers
│   │   ├── config.rs            # Configuration loading
│   │   ├── middleware/          # Rate limiting, tracing, project middleware
│   │   ├── cost.rs              # Cost calculation
│   │   └── guardrails.rs        # Content filtering
│   └── Cargo.toml
├── langdb-core/                 # Core AI proxy logic
├── langdb-metadata/             # Database models and services
└── docker-compose.yml           # Local development setup
```

### Data Flow
1. **User Action** (Ellora UI) → HTTP Request → AI Gateway
2. **AI Gateway** processes request:
   - Validates input
   - Applies guardrails
   - Routes to appropriate provider (OpenAI, Anthropic, etc.)
   - Tracks costs and usage
   - Logs traces
3. **Provider Response** → AI Gateway → Streamed to Ellora UI (SSE)
4. **Ellora UI** renders response with markdown

### OpenAI Compatibility
- Chat completions follow OpenAI API format
- Supports multimodal content (text, images, audio)
- Streaming via Server-Sent Events (SSE)
- Model switching without page reload
- Compatible with OpenAI SDK and tools

### Database Integration
- **PostgreSQL**: Stores projects, usage data, metadata
- **ClickHouse** (optional): Stores traces and telemetry
- Connection pool managed via `DbPool`
- Migrations handled by backend

### Middleware Stack
Backend applies middleware in order:
1. **TraceLogger**: Logs all requests/responses
2. **ProjectMiddleware**: Extracts project context
3. **RateLimitMiddleware**: Enforces rate limits per project
4. **CORS**: Permissive CORS for local development

## Contributing Guidelines

### Code Organization
- Place new components in appropriate folders
- Create documentation for complex components
- Add TypeScript interfaces for all data structures

### Component Guidelines
- Use functional components with hooks
- Avoid prop drilling (use context if needed)
- Keep components focused and small
- Document props with JSDoc comments

### Styling Guidelines
- Use Tailwind utilities first
- Extract repeated patterns to CSS classes
- Use semantic color tokens, not hardcoded colors
- Ensure responsive design for all components

### API Integration
- All API calls go through service layer
- Define request/response types
- Handle errors gracefully
- Log errors for debugging

## Troubleshooting

### Common Issues

**Problem**: Models not loading
- Check AI Gateway is running on `http://0.0.0.0:8080`
- Verify CORS settings in gateway
- Check browser console for errors

**Problem**: Theme not applying
- Clear localStorage and refresh
- Check browser console for CSS variable errors
- Verify theme definitions in `themes.ts`

**Problem**: Chat not streaming
- Check network tab for SSE connection
- Verify API endpoint is correct
- Check for CORS errors

**Problem**: File upload failing
- Check file size (may have limits)
- Verify base64 conversion is working
- Check API supports multimodal content

## Conclusion

Ellora UI is designed to be:
- **User-friendly**: Clean, intuitive interface
- **Flexible**: Multiple themes, collapsible panels, responsive
- **Extensible**: Modular architecture, easy to add features
- **Type-safe**: Full TypeScript coverage
- **Performant**: Optimized rendering, lazy loading
- **Maintainable**: Clear structure, documented patterns

For questions or contributions, refer to the project README and component-level documentation.