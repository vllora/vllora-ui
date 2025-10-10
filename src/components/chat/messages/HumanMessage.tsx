import React from 'react';
import { Clock } from 'lucide-react';
import { Message } from '@/types/chat';
import { MessageDisplay } from '../MessageDisplay';
import { ContentArrayDisplay } from './ContentArrayDisplay';
import { formatMessageTime } from '@/utils/dateUtils';
import { useRelativeTime } from '@/hooks/useRelativeTime';

interface HumanMessageProps {
  message: Message;
}

export const HumanMessage: React.FC<HumanMessageProps> = ({ message }) => {
  const messageRef = React.useRef<HTMLDivElement>(null);

  // Only update relative time when message is visible
  useRelativeTime(messageRef, message.created_at);

  return (
    <div className="flex flex-col group mb-6" ref={messageRef}>
      {/* Header with Avatar and Metadata */}
      <div className="flex items-center gap-3 pb-3 border-b border-neutral-800/30">
        

        {/* Metadata */}
        <div className="flex items-center gap-2 flex-1">
          {message.created_at && (
            <div className="flex items-center gap-2 text-xs text-neutral-500">
              <span>{formatMessageTime(message.created_at)}</span>
              <Clock className="h-3 w-3 mr-1" />
            </div>
          )}
        </div>
        <div className="flex-shrink-0">
          <span className="text-sm font-medium text-neutral-300">User</span>
        </div>
        
      </div>

      {/* Content */}
      <div className="w-full pt-3">
        {message.files && message.files.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2">
            {message.files.map((file, index) => (
              <div key={index} className="relative">
                {file.type.startsWith('image/') && file.preview && (
                  <img
                    src={file.preview}
                    alt={file.name}
                    className="max-w-xs rounded-lg"
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {message.content_array && message.content_array.length > 0 ? (
          <div className="text-right">
            <ContentArrayDisplay contentArray={message.content_array} />
          </div>
        ) : (
          <div className="text-neutral-100 leading-relaxed whitespace-normal break-words text-sm text-right">
            <MessageDisplay message={message.content} />
          </div>
        )}
      </div>
    </div>
  );
};
