// Context providers and consumers
export { AuthProvider, AuthConsumer } from '../contexts/AuthContext';
export { ProjectsProvider, ProjectsConsumer } from '../contexts/ProjectContext';
export { LocalModelsProvider, LocalModelsConsumer } from '../contexts/LocalModelsContext';
export { ProviderKeysProvider, ProviderKeysConsumer } from '../contexts/ProviderKeysContext';
export { ProjectEventsProvider, ProjectEventsConsumer } from '../contexts/project-events';
export { CurrentAppProvider, CurrentAppConsumer } from '../contexts/CurrentAppContext';
// Theme provider
export { ThemeProvider } from '../components/theme-provider';

// Components
export { ProtectedRoute } from '../components/ProtectedRoute';
export { Layout } from '../components/layout';
export { LocalModelsSkeletonLoader } from '../components/models/local/LocalModelsSkeletonLoader';
export { ProviderIcon } from '../components/Icons/ProviderIcons';

// Page components (for custom routing)
export { HomePage } from '../pages/home';
export { ThreadsAndTracesPage } from '../pages/chat';
export { ProjectsPage } from '../pages/projects';
export { AnalyticsPage } from '../pages/analytics';
export { SettingsPage } from '../pages/settings';
export { ModelsPage } from '../pages/models';
export { McpConfigPage } from '../pages/settings/mcp-config';
export { ProviderKeysPage } from '../pages/settings/provider-keys';
// Provider form components (API-agnostic UI)
export { ProviderCredentialForm } from '../pages/settings/ProviderCredentialForm';
export { ProviderCredentialModal } from '../pages/settings/ProviderCredentialModal';
export { DeleteProviderDialog } from '../pages/settings/DeleteProviderDialog';
export { ProviderKeysLoader } from '../pages/settings/ProviderKeysLoader';
export type { CredentialFormValues } from '../pages/settings/ProviderCredentialForm';
export { ProjectDropdown } from '../components/ProjectDropdown';
export { ModelSelector } from '../components/chat/traces/model-selector'
export type { ModelPricing } from '../types/models';
export  {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
// Toaster for notifications
export { Toaster } from 'sonner';

// Theme utilities
export { applyTheme, getThemeFromStorage } from '../themes/themes';

// API client utilities
export { setTokenProvider } from './api-client';
