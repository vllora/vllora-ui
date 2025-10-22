/**
 * MockChatWindowProvider - Placeholder for future context mocking
 *
 * The span display components (ModelInvokeUIDetailsDisplay, VirtualModelCallUIDetailsDisplay, etc.)
 * use ChatWindowConsumer internally to access `spansOfSelectedRun`.
 *
 * Since ChatWindowContext is not exported from ChatWindowContext.tsx, we cannot easily provide
 * a mock context here. The display components will call ChatWindowConsumer() and may encounter
 * issues if the context is not available.
 *
 * Current behavior: This is a pass-through wrapper. The sub-components will work with whatever
 * data is in their span.attribute, which should be sufficient for most use cases.
 *
 * Future improvement: Export ChatWindowContext from ChatWindowContext.tsx so we can provide
 * a proper mock here with relatedSpans.
 */

import React, { ReactNode } from 'react';
import { Span } from '@/types/common-type';

interface MockChatWindowProviderProps {
  children: ReactNode;
  span: Span;
  relatedSpans: Span[];
}

export const MockChatWindowProvider: React.FC<MockChatWindowProviderProps> = ({
  children,
}) => {
  // Pass-through for now - child components will handle missing context gracefully
  return <>{children}</>;
};
