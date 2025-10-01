# Home Page - Model Browser Documentation

## Overview

The Home page serves as the **Model Browser** for Ellora UI. It displays all available AI models from the AI Gateway, allowing users to explore model capabilities, view metadata, and quickly access model identifiers for use in conversations.

## Location

- **Page Component**: `/src/pages/home.tsx`
- **Model Components**: `/src/components/models/local/`
  - `LocalModelsExplorer.tsx` - Main explorer with view modes and filters
  - `LocalModelsSkeletonLoader.tsx` - Loading state skeleton
  - `ModelCard.tsx` - Individual model card component
  - `ModelGrid.tsx` - Grid view layout
  - `ModelList.tsx` - List view layout

## API Integration

### Endpoint
```
GET http://0.0.0.0:8080/v1/models
```

### Backend Handler
**Location**: `ai-gateway/core/src/handler/models.rs`

**Handler Function**: `list_gateway_models`

### Request
No request body or parameters required.

### Response Structure

```typescript
// Response Type: ChatModelsResponse
{
  object: "list",
  data: [
    {
      id: string,        // Qualified model name (e.g., "openai/gpt-4o")
      object: "model",   // Always "model"
      created: number,   // Unix timestamp
      owned_by: string   // Provider name (e.g., "openai", "anthropic")
    }
  ]
}
```

### Backend Implementation Details

From `ai-gateway/core/src/handler/models.rs`:

```rust
pub async fn list_gateway_models(
    models: web::Data<AvailableModels>,
) -> Result<HttpResponse, GatewayApiError> {
    let response = ChatModelsResponse {
        object: "list".to_string(),
        data: models
            .into_inner()
            .0
            .iter()
            .map(|v| ChatModel {
                id: v.qualified_model_name(),      // "provider/model-name"
                object: "model".to_string(),
                created: 1686935002,
                owned_by: v.model_provider.to_string(),
            })
            .collect(),
    };

    Ok(HttpResponse::Ok().json(response))
}
```

**Data Source**:
- Models come from `AvailableModels` registry
- Registry populated from backend configuration (config files, environment variables)
- Each `ModelMetadata` includes provider, name, capabilities, pricing

**DTO Structures**:
- `ChatModelsResponse`: Top-level response wrapper
- `ChatModel`: Individual model representation (OpenAI-compatible format)

## Features

### View Modes

#### Grid View
- Default view mode
- Visual cards with model information
- Responsive grid layout (adjusts columns based on screen size)
- Ideal for browsing and visual exploration

#### List View
- Compact table-style layout
- Shows models in rows with columns
- Better for scanning many models quickly
- More information density

### Search & Filtering

**Search Bar**:
- Real-time search across model names and providers
- Filters models as you type
- Case-insensitive matching

**Filters** (planned):
- Filter by provider (OpenAI, Anthropic, Google, etc.)
- Filter by capabilities (chat, embeddings, image generation)
- Filter by pricing tier
- Sort options (alphabetical, by provider, by popularity)

### Model Cards

Each model card displays:

**Primary Information**:
- Model ID (qualified name, e.g., `openai/gpt-4o`)
- Provider badge/logo
- Creation timestamp (formatted as human-readable date)

**Actions**:
- **Copy Model ID**: Quick copy to clipboard
- **Copy Provider**: Copy provider name
- **View Details** (planned): Modal with full model metadata

**Visual Design**:
- Card with border and shadow
- Hover effects for interactivity
- Color-coded provider badges
- Responsive card sizing

### Loading States

**Skeleton Loader**:
- Displays placeholder cards while fetching
- Matches the selected view mode (grid or list)
- Animated shimmer effect
- Shows configurable number of skeleton items (default: 9 for grid, 5 for list)

**Component**: `LocalModelsSkeletonLoader.tsx`

### Error Handling

**Error Display**:
- Shows when API request fails
- Displays error message
- Includes "Try Again" button with retry functionality
- Icon indicator (AlertCircle from lucide-react)

**Error States**:
- Network error (gateway not reachable)
- API error (500, 503, etc.)
- Timeout errors

### Statistics

**Models Counter**:
- Displays total number of available models
- Updates when filters are applied (shows filtered count)
- Format: "X Models" or "1 Model"

## State Management

### Custom Hook: `useLocalModels`

**Location**: `/src/hooks/useLocalModels.ts`

**Purpose**: Manages fetching and state for local models from AI Gateway

**Returns**:
```typescript
{
  models: LocalModel[],      // Array of model data
  loading: boolean,          // Loading state
  error: Error | null,       // Error object if fetch failed
  refetch: () => void        // Function to retry fetch
}
```

**Behavior**:
- Fetches on component mount
- Handles loading states
- Catches and stores errors
- Provides refetch mechanism for retry

### URL State Synchronization

**View Mode**:
- Synced with URL query parameter: `?view=grid` or `?view=list`
- Persists view preference across page reloads
- Updates when toggling between views

**Search Query** (planned):
- Sync search input with URL: `?search=gpt`
- Shareable URLs with search applied

**Filters** (planned):
- Sync all filters with URL params
- Example: `?provider=openai&capability=chat`

## Component Structure

```
HomePage
├── Header
│   ├── Title: "Local AI Models Gallery"
│   ├── Description
│   └── Server Info Badge (localhost:8080)
│
├── Loading State (if loading)
│   └── LocalModelsSkeletonLoader
│
├── Error State (if error)
│   ├── Error Icon
│   ├── Error Message
│   └── Retry Button
│
└── LocalModelsExplorer (if loaded)
    ├── Filters Section
    │   ├── Search Bar
    │   └── Filter Chips
    │
    ├── View Controls
    │   ├── Models Count
    │   └── View Mode Toggle (Grid/List)
    │
    └── Models Display
        ├── ModelGrid (if grid view)
        │   └── ModelCard[]
        └── ModelList (if list view)
            └── ModelListItem[]
```

## Styling & Design

### Color Scheme

**Brand Colors**:
- Emerald accent: Used for "Gallery" text in header
- Server badge: Emerald for localhost indicator

**Card Styling**:
- Background: `bg-card`
- Border: `border-border`
- Hover: Subtle scale and shadow effects

### Typography

**Header**:
- Title: Large bold text (5xl-6xl)
- "Gallery" text: Gradient from emerald-400 to emerald-600
- Description: Muted text color

**Model Cards**:
- Model ID: Medium font weight
- Provider: Small badge text
- Metadata: Muted secondary text

### Responsive Design

**Breakpoints**:
- Mobile (< 640px): 1 column grid, stacked layout
- Tablet (640-1024px): 2-3 column grid
- Desktop (> 1024px): 3-4 column grid

**Mobile Optimizations**:
- Simplified card layout
- Touch-friendly buttons
- Responsive typography

## Data Flow

```
1. User navigates to Home page (/)
   ↓
2. HomePage component mounts
   ↓
3. useLocalModels hook triggers
   ↓
4. API request: GET http://0.0.0.0:8080/v1/models
   ↓
5. AI Gateway processes request
   ├─ Loads AvailableModels from registry
   └─ Maps to ChatModel DTOs
   ↓
6. Response returned to frontend
   ↓
7. Data stored in component state
   ↓
8. LocalModelsExplorer renders models
   ├─ Grid or List view based on URL param
   └─ Applies search/filters
   ↓
9. User interacts:
   ├─ Copy model ID → Clipboard
   ├─ Switch view mode → URL updates
   ├─ Search → Filters models
   └─ Retry on error → Refetch
```

## Future Enhancements

### Planned Features

**Project-Scoped Models**:
- Filter models by current project context
- Show only models enabled for the active project
- Project-specific model access control

**Model Details Modal**:
- Click card to view full details
- Show capabilities (chat, streaming, function calling)
- Display pricing information
- View model parameters and limits
- Link to provider documentation

**Advanced Filtering**:
- Multi-select provider filter
- Capability-based filters (embeddings, vision, etc.)
- Price range filter
- Context window size filter

**Sorting Options**:
- Sort by name (A-Z, Z-A)
- Sort by provider
- Sort by recently added
- Sort by popularity/usage

**Model Comparison**:
- Select multiple models to compare
- Side-by-side capabilities
- Pricing comparison
- Performance benchmarks

**Favorites/Bookmarks**:
- Save frequently used models
- Quick access to favorites
- Per-user or per-project favorites

**Model Testing**:
- Quick test button on card
- Opens chat with model pre-selected
- Playground mode for testing

**Provider Logos**:
- Display provider logos/icons
- Better visual identification
- Branded cards

### Technical Improvements

**Performance**:
- Virtual scrolling for large model lists
- Lazy loading of model cards
- Debounced search input
- Memoized filter computations

**Accessibility**:
- Keyboard navigation for cards
- Screen reader announcements
- ARIA labels for all interactive elements
- Focus management

**Analytics**:
- Track most viewed models
- Monitor search queries
- Usage statistics

**Offline Support**:
- Cache model list
- Offline indicator
- Graceful degradation

## Integration Points

### Backend Dependencies

**AI Gateway**:
- Must be running on `http://0.0.0.0:8080`
- Models registered in gateway configuration
- AvailableModels registry populated

**Configuration Sources**:
- `providers.yaml` - Provider configurations
- Environment variables - API keys, endpoints
- Database - Custom model configurations (future)

### Frontend Dependencies

**Services**:
- `/src/services/models-api.ts` - API client functions
- Exports `fetchLocalModels()` function

**Types**:
- `/src/types/models.ts` - TypeScript interfaces
- `LocalModelsResponse`, `LocalModel` types

**Configuration**:
- `/src/config/api.ts` - API URL configuration
- `LOCAL_API_URL` constant

### Related Components

**Navigation**:
- AppSidebar - "Home" menu item navigates here
- Active when path is `/`

**Chat Integration**:
- Copied model IDs used in Chat page
- Model selector references available models

## Troubleshooting

### Common Issues

**Problem**: "Failed to Load Local Models"
- **Cause**: AI Gateway not running or unreachable
- **Solution**:
  1. Verify gateway is running: `curl http://0.0.0.0:8080/v1/models`
  2. Check gateway logs for errors
  3. Ensure correct URL in `LOCAL_API_URL`

**Problem**: Empty model list
- **Cause**: No models registered in gateway
- **Solution**:
  1. Check gateway configuration files
  2. Verify provider API keys are set
  3. Review gateway startup logs

**Problem**: CORS errors
- **Cause**: Gateway CORS not configured for frontend origin
- **Solution**:
  1. Check gateway CORS settings (should be permissive for local dev)
  2. Verify frontend running on expected port

**Problem**: Slow loading
- **Cause**: Many models registered, slow network
- **Solution**:
  1. Implement pagination (future)
  2. Add caching layer
  3. Optimize backend query

## Testing

### Manual Testing Checklist

- [ ] Models load on page mount
- [ ] Skeleton loader displays during fetch
- [ ] Error state shows on failed fetch
- [ ] Retry button refetches data
- [ ] Grid view displays correctly
- [ ] List view displays correctly
- [ ] View toggle updates URL
- [ ] Copy buttons work (model ID, provider)
- [ ] Search filters models (when implemented)
- [ ] Responsive design works on mobile
- [ ] Hover effects work on cards

### Test Data

**Mock Response**:
```json
{
  "object": "list",
  "data": [
    {
      "id": "openai/gpt-4o",
      "object": "model",
      "created": 1686935002,
      "owned_by": "openai"
    },
    {
      "id": "anthropic/claude-3-5-sonnet-20241022",
      "object": "model",
      "created": 1686935002,
      "owned_by": "anthropic"
    }
  ]
}
```

## Conclusion

The Home page (Model Browser) is a critical feature for discovering and accessing AI models in Ellora UI. It provides a clean, responsive interface for exploring all models available through the AI Gateway, with plans for enhanced filtering, project-scoping, and detailed model information in future releases.