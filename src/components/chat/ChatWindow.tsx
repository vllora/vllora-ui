import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import { ChatConversation } from './ChatConversation';
import { ChatInput } from './ChatInput';
import { Thread } from '@/types/chat';
import { useLocalModels } from '@/hooks/useLocalModels';
import { ProviderIcon } from '@/components/Icons/ProviderIcons';

interface ChatWindowProps {
  thread: Thread;
  isLoading: boolean;
  onSendMessage: (content: string) => void;
  onModelChange?: (modelId: string) => void;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({
  thread,
  isLoading,
  onSendMessage,
  onModelChange,
}) => {
  const { models } = useLocalModels();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
        setSearchTerm('');
      }
    };

    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  const filteredModels = models.filter((model) =>
    model.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleModelSelect = (modelId: string) => {
    onModelChange?.(modelId);
    setIsDropdownOpen(false);
    setSearchTerm('');
  };

  const getProviderFromModelId = (modelId: string) => {
    return modelId.split('/')[0];
  };

  return (
    <>
      {/* Chat Header */}
      <div className="border-b border-border p-4 bg-card flex-shrink-0">
        <h2 className="text-lg font-semibold text-card-foreground">
          {thread.title || 'New conversation'}
        </h2>

        {/* Model Selector Dropdown */}
        <div className="relative mt-2" ref={dropdownRef}>
          <button
            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ProviderIcon
              provider_name={getProviderFromModelId(thread.model)}
              className="w-4 h-4"
            />
            <span>{thread.model}</span>
            <ChevronDown className={`w-4 h-4 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {isDropdownOpen && (
            <div className="absolute top-full left-0 mt-2 w-96 bg-popover border border-border rounded-lg shadow-xl z-50">
              {/* Search Input */}
              <div className="p-3 border-b border-border">
                <input
                  type="text"
                  placeholder="Search models..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-background text-foreground placeholder-muted-foreground px-3 py-2 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring border border-input"
                  autoFocus
                />
              </div>

              {/* Models List */}
              <div className="max-h-80 overflow-y-auto">
                {filteredModels.length > 0 ? (
                  filteredModels.map((model) => (
                    <button
                      key={model.id}
                      onClick={() => handleModelSelect(model.id)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-accent transition-colors ${
                        model.id === thread.model ? 'bg-accent/50' : ''
                      }`}
                    >
                      <ProviderIcon
                        provider_name={getProviderFromModelId(model.id)}
                        className="w-5 h-5 flex-shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-popover-foreground truncate">{model.id}</p>
                        <p className="text-xs text-muted-foreground">{model.owned_by}</p>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="px-4 py-8 text-center text-muted-foreground text-sm">
                    No models found
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Chat Conversation */}
      <ChatConversation
        messages={thread.messages}
        isLoading={isLoading}
      />

      {/* Chat Input */}
      <div className="flex-shrink-0">
        <ChatInput
          onSendMessage={onSendMessage}
          disabled={isLoading}
        />
      </div>
    </>
  );
};