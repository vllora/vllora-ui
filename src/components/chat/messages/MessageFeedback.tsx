import React, { useState, useCallback } from 'react';
import { ThumbsUp, ThumbsDown } from 'lucide-react';

interface MessageFeedbackProps {
  threadId?: string;
  messageId?: string;
  isTyping?: boolean;
}

export const MessageFeedback: React.FC<MessageFeedbackProps> = ({
  threadId,
  messageId,
  isTyping,
}) => {
  const [score, setScore] = useState<number | undefined>();
  const [error, setError] = useState<string | undefined>();

  const handleScore = useCallback(
    async (scoreValue: number) => {
      // TODO: Implement API call to record score
      console.log('Score recorded:', {
        thread_id: threadId,
        message_id: messageId,
        score: scoreValue,
      });
      setScore(scoreValue);
    },
    [threadId, messageId]
  );

  if (isTyping || !threadId || !messageId) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 text-xs text-neutral-500">
      <button
        className="p-0.5 hover:text-neutral-300 transition-colors duration-150"
        title="Helpful"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleScore(1);
        }}
      >
        <ThumbsUp
          className={`h-3 w-3 ${score === 1 ? 'fill-green-500 text-green-500' : ''}`}
        />
      </button>
      <button
        className="p-0.5 hover:text-neutral-300 transition-colors duration-150"
        title="Not helpful"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleScore(-1);
        }}
      >
        <ThumbsDown
          className={`h-3 w-3 ${score === -1 ? 'fill-orange-500 text-orange-500' : ''}`}
        />
      </button>
      {error && <div className="text-xs text-red-500 ml-2">{error}</div>}
    </div>
  );
};
