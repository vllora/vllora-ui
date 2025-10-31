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
    <div className="flex flex-col gap-3 group overflow-hidden" ref={messageRef}>
      {/* Header with Metadata */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 flex-1">
          {message.created_at && (
            <div className="flex items-center text-xs text-neutral-500">
              <Clock className="h-3 w-3 mr-1" />
              <span>{formatMessageTime(message.created_at)}</span>
            </div>
          )}
        </div>
        <div className="flex-shrink-0">
          <span className="text-sm font-medium text-neutral-300">User</span>
        </div>
      </div>

      {/* Content */}
      <div className=" overflow-hidden flex flex-1">
        {message.files && message.files.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2 justify-end">
            {message.files.map((file, index) => (
              <div key={index} className="relative">
                {file.type.startsWith('image/') && file.preview && (
                  <img
                    src={file.preview}
                    alt={file.name}
                    className="max-w-xs rounded-lg border border-neutral-800/50"
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {message.content_array && message.content_array.length > 0 ? (
          <div className="flex flex-col  justify-end overflow-hidden">
            <div className="max-w-[80%]">
              <ContentArrayDisplay contentArray={message.content_array} />
            </div>
          </div>
        ) : (
          <div className="flex justify-end flex-1">
            <div className="text-neutral-200 flex-1 leading-relaxed whitespace-normal break-words text-sm bg-neutral-900/30 border border-neutral-800/50 rounded-lg px-4 py-3">
              <MessageDisplay message={message.content} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
