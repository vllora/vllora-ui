/**
 * LucyProviderCheck
 *
 * Shows setup UI when OpenAI provider is not configured.
 * Lucy uses OpenAI models by default, so this is required.
 */

import { KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { LucyAvatar } from './LucyAvatar';
import { useProviderModal } from '@/contexts/ProviderModalContext';
import { ProviderKeysConsumer } from '@/contexts/ProviderKeysContext';

// ============================================================================
// Types
// ============================================================================

interface LucyProviderCheckProps {
  /** Callback when API key is saved successfully */
  onReady: () => void;
  /** Optional className */
  className?: string;
}

// ============================================================================
// Component
// ============================================================================

export function LucyProviderCheck({ onReady, className }: LucyProviderCheckProps) {
  const { openProviderModal } = useProviderModal();
  const { refetchProviders } = ProviderKeysConsumer();

  const handleOpenModal = () => {
    openProviderModal('openai', () => {
      // Refetch providers so the parent can see the updated state
      refetchProviders();
      onReady();
    });
  };

  return (
    <div className={cn('flex flex-col items-center justify-center h-full p-6', className)}>
      <LucyAvatar size="lg" className="mb-4" />
      <h2 className="text-base font-semibold mb-2">Set Up Lucy</h2>
      <p className="text-sm text-muted-foreground text-center mb-6 max-w-xs">
        Lucy requires an OpenAI API key to work. Add your API key to get started.
      </p>
      <Button onClick={handleOpenModal} size="default" className="gap-2">
        <KeyRound className="h-4 w-4" />
        Add OpenAI API Key
      </Button>
    </div>
  );
}

export default LucyProviderCheck;
