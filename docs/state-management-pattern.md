# State Management Pattern

This document describes the state management pattern used in the Ellora UI application.

## Overview

We use **React Context API** combined with **ahooks** for managing server state across the application. This pattern provides:

- **Centralized state management** - Single source of truth for shared data
- **Automatic request handling** - Built-in loading, error states, and caching
- **No duplicate requests** - Automatic deduplication with ahooks
- **Toast notifications** - User-friendly error messages with Sonner
- **Type safety** - Full TypeScript support

## Pattern Structure

### 1. Context File Structure

Each context follows this structure:

```typescript
// src/contexts/[Feature]Context.tsx

import { createContext, useContext, ReactNode } from 'react';
import { useRequest } from 'ahooks';
import { toast } from 'sonner';
import { apiFunction, type DataType } from '@/services/[feature]-api';

// 1. Define the context type
interface FeatureContextType {
  data: DataType[];
  loading: boolean;
  error: Error | undefined;
  refetchData: () => void;
  // Add any other state/methods needed
}

// 2. Create the context
const FeatureContext = createContext<FeatureContextType | undefined>(undefined);

// 3. Create the Provider
export function FeatureProvider({ children }: { children: ReactNode }) {
  const { data, loading, error, run: refetchData } = useRequest(apiFunction, {
    onError: (err) => {
      toast.error('Failed to load data', {
        description: err.message || 'An error occurred',
      });
    },
  });

  const value: FeatureContextType = {
    data: data || [],
    loading,
    error,
    refetchData,
  };

  return <FeatureContext.Provider value={value}>{children}</FeatureContext.Provider>;
}

// 4. Create the Consumer hook
export function FeatureConsumer() {
  const context = useContext(FeatureContext);
  if (context === undefined) {
    throw new Error('FeatureConsumer must be used within a FeatureProvider');
  }
  return context;
}
```

### 2. Naming Convention

- **Context file**: `[Feature]Context.tsx` (e.g., `ProjectContext.tsx`)
- **Provider component**: `[Feature]Provider` (e.g., `ProjectProvider`)
- **Consumer hook**: `[Feature]Consumer()` (e.g., `ProjectsConsumer()`)

Note: Use plural form when it makes sense (e.g., `ProjectsConsumer` for multiple projects)

### 3. App Integration

Wrap your app with the provider in `App.tsx`:

```typescript
import { FeatureProvider } from './contexts/FeatureContext'

function App() {
  return (
    <ThemeProvider>
      <FeatureProvider>
        {/* Your app routes */}
      </FeatureProvider>
    </ThemeProvider>
  )
}
```

### 4. Using in Components

```typescript
import { FeatureConsumer } from '@/contexts/FeatureContext';

export function MyComponent() {
  const { data, loading, error, refetchData } = FeatureConsumer();

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error.message}</div>;

  return (
    <div>
      {data.map(item => (
        <div key={item.id}>{item.name}</div>
      ))}
      <button onClick={refetchData}>Refresh</button>
    </div>
  );
}
```

## Existing Contexts

### ProjectContext

Manages project data across the application.

**Location**: `src/contexts/ProjectContext.tsx`

**Usage**:
```typescript
import { ProjectsConsumer } from '@/contexts/ProjectContext';

const { projects, loading, error, refetchProjects, currentProject, currentProjectId } = ProjectsConsumer();
```

**Features**:
- Fetches all projects on mount
- Automatically derives current project from URL path parameter
- Provides refetch function for mutations
- Single source of truth synced with React Router

### LocalModelsContext

Manages local AI models data across the application.

**Location**: `src/contexts/LocalModelsContext.tsx`

**Usage**:
```typescript
import { LocalModelsConsumer } from '@/contexts/LocalModelsContext';

const { models, loading, error, refetchModels } = LocalModelsConsumer();
```

**Features**:
- Fetches local models from API
- Automatic error handling with toast notifications
- Shared across HomePage, ModelSelector, etc.

## Best Practices

### 1. When to Use Context

✅ **Use Context for**:
- Data shared across multiple components
- Server state that needs to be cached
- Data that requires frequent refetching
- User preferences and settings

❌ **Don't Use Context for**:
- Local component state
- Form state (use local state or form libraries)
- Derived/computed values (use useMemo instead)

### 2. Error Handling

Always show user-friendly error messages:

```typescript
const { data, loading, error, run } = useRequest(apiFunction, {
  onError: (err) => {
    toast.error('Failed to load data', {
      description: err.message || 'An error occurred',
    });
  },
});
```

### 3. Success Notifications

For mutations, show success messages:

```typescript
const handleCreate = async () => {
  try {
    await createItem(data);
    refetchData();
    toast.success('Item created', {
      description: 'The item has been created successfully',
    });
  } catch (error) {
    toast.error('Failed to create item', {
      description: error instanceof Error ? error.message : 'An error occurred',
    });
  }
};
```

### 4. Manual Requests

If you need to defer the initial request:

```typescript
const { data, loading, run } = useRequest(apiFunction, {
  manual: true, // Don't run on mount
});

// Call it manually when needed
useEffect(() => {
  if (someCondition) {
    run();
  }
}, [someCondition]);
```

## Migration Guide

### From Custom Hook to Context

If you have a custom hook like this:

```typescript
// Old: src/hooks/useFeature.ts
export function useFeature() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  return { data, loading, error };
}
```

Migrate to:

1. Create context file following the pattern above
2. Add provider to App.tsx
3. Replace hook usage with consumer:
   ```typescript
   // Old
   import { useFeature } from '@/hooks/useFeature';
   const { data } = useFeature();

   // New
   import { FeatureConsumer } from '@/contexts/FeatureContext';
   const { data } = FeatureConsumer();
   ```
4. Delete old hook file

## Tools Used

### ahooks

- **useRequest**: Manages async requests with loading/error states
- Documentation: https://ahooks.js.org/hooks/use-request

### Sonner

- **toast**: Beautiful, customizable toast notifications
- Documentation: https://sonner.emilkowal.ski/

## FAQ

**Q: Why Context instead of Redux/Zustand?**
A: For our use case, Context + ahooks provides simpler code, less boilerplate, and built-in request management. It's perfect for server state.

**Q: Will this cause unnecessary re-renders?**
A: No, React Context only re-renders components that consume the specific values that changed. For optimization, you can split contexts if needed.

**Q: How do I handle dependent requests?**
A: Use `manual: true` and call `run()` in a useEffect:
```typescript
const { data: secondData, run: runSecond } = useRequest(secondAPI, { manual: true });

useEffect(() => {
  if (firstData) {
    runSecond(firstData.id);
  }
}, [firstData]);
```

**Q: Can I use multiple contexts?**
A: Yes! Nest providers in App.tsx:
```typescript
<ProviderA>
  <ProviderB>
    <ProviderC>
      {/* App */}
    </ProviderC>
  </ProviderB>
</ProviderA>
```
