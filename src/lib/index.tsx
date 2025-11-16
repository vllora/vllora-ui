// Context providers and consumers
export { AuthProvider, AuthConsumer } from '../contexts/AuthContext';
export { ProjectsProvider, ProjectsConsumer } from '../contexts/ProjectContext';
export { ProviderKeysProvider, ProviderKeysConsumer } from '../contexts/ProviderKeysContext';
export { ProjectEventsProvider, ProjectEventsConsumer } from '../contexts/project-events';
export { CurrentAppProvider, CurrentAppConsumer } from '../contexts/CurrentAppContext';
export { ProjectModelsProvider, ProjectModelsConsumer } from '../contexts/ProjectModelsContext';
export { VirtualModelsProvider, VirtualModelsConsumer } from '../contexts/VirtualModelsContext';
export { AvailableApiKeysProvider, AvailableApiKeysConsumer } from '../contexts/AvailableApiKeys'
export type { AvailableApiKey } from '../contexts/AvailableApiKeys'
export type { VirtualModel, VirtualModelVersion, VirtualModelVariable } from '../services/virtual-models-api';
// Theme provider
export { ThemeProvider } from '../components/theme-provider';

// Components
export { ProtectedRoute } from '../components/ProtectedRoute';
export { Layout } from '../components/layout';
export { LocalModelsSkeletonLoader } from '../components/models/local/LocalModelsSkeletonLoader';
export { ProviderIcon } from '../components/Icons/ProviderIcons';
export { ErrorBoundary } from '../components/ErrorBoundary';

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
export { BackendUrlInfo } from '../components/BackendUrlInfo';
export { ModelSelector, ModelSelectorComponent } from '../components/chat/traces/model-selector'
export { ModelConfigDialog } from '../components/chat/conversation/model-config';
export { VirtualModelCRUDDialog } from '../components/chat/conversation/model-config/crud-virtual-model-dialog';
export type { ModelInfo } from '../types/models';
export {
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
