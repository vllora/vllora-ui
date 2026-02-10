/**
 * Lucy Agent Components
 *
 * Custom chat interface components for the Lucy AI assistant.
 */

// Initialize Lucy-themed styles for distri components
import { initializeLucyAskFollowUpStyles } from './lucy-ask-follow-up-styles';
initializeLucyAskFollowUpStyles();

// Core chat components
export * from './LucyAvatar';
export * from './LucyChat';
export * from './LucyChatInput';
export * from './LucyWelcome';
export * from './LucySetupGuide';
export * from './LucyProviderCheck';

// Message rendering components
export * from './LucyMessage';
export * from './messages/LucyMessageRenderer';
export * from './messages/LucyUserMessage';
export * from './messages/LucyAssistantMessage';
export * from './LucyTextRenderer';
export * from './LucyImageRenderer';
export * from './LucyStepIndicator';

// Tool components
export * from './LucyToolCalls';
export * from './LucyToolRenderer';
export * from './setup-plan-render/LucySetupPlanRenderer';
export * from './LucyToolCallCard';
export * from './LucyToolExecutionRenderer';
export * from './LucyToolActions';

// Streaming and pending components
export * from './LucyPendingMessage';
export * from './LucyStreamingIndicator';

// Utilities
export * from './lucy-message-utils';
