import { useCallback, useState } from 'react';
import { Message, ModelUsage } from '@/types/chat';

export const useChatState = (props: {
  messages: Message[];
  onSetMessages: React.Dispatch<React.SetStateAction<Message[]>>;
}) => {
  const { messages, onSetMessages } = props;
  const [currentInput, setCurrentInput] = useState<string>('');
  const [threadId, setThreadId] = useState<string | undefined>();
  const [messageId, setMessageId] = useState<string | undefined>();
  const [traceId, setTraceId] = useState<string | undefined>();
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [usageInfo, setUsageInfo] = useState<ModelUsage[]>([]);

  const appendUsage = useCallback(
    (usage: ModelUsage) => {
      setUsageInfo((prevUsage) => [...prevUsage, usage]);
    },
    [setUsageInfo]
  );

  return {
    
    currentInput,
    setCurrentInput,
    threadId,
    setThreadId,
    messageId,
    setMessageId,
    traceId,
    setTraceId,
    typing,
    setTyping,
    error,
    setError,
    usageInfo,
    appendUsage,
    onSetMessages,
    messages
  };
};