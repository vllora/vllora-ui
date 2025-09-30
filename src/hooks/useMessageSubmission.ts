import { useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Message, MessageType, MessageContentType, FileWithPreview, ChatCompletionChunk } from '@/types/chat';
import { useChatState } from './useChatState';
import { useScrollToBottom } from './useScrollToBottom';
import { emitter } from '@/utils/eventEmitter';
import { getChatCompletionsUrl } from '@/config/api';

interface MessageSubmissionProps {
  apiUrl: string;
  apiKey?: string;
  projectId?: string;
  modelName?: string;
  onEvent?: (event: ChatCompletionChunk) => void;
  widgetId?: string;
}

export const useMessageSubmission = (
  props: MessageSubmissionProps,
  chatState: ReturnType<typeof useChatState>
) => {
  const abortControllerRef = useRef<AbortController | null>(null);
  const {
    setMessages,
    setCurrentInput,
    setTyping,
    setError,
    setMessageId,
    setThreadId,
    setTraceId,
    appendUsage,
    messageId,
    traceId,
    threadId,
    messages,
  } = chatState;

  const { messagesEndRef, scrollToBottom } = useScrollToBottom();

  const handleMessage = useCallback(
    (
      data: string,
      currentThreadId?: string,
      currentMessageId?: string,
      currentTraceId?: string | null,
      currentRunId?: string | null
    ) => {
      try {
        if (data === '[DONE]') {
          return;
        }

        const jsonMsg = tryParseJson(data);
        if (!jsonMsg) {
          return;
        }

        if (jsonMsg.error) {
          setError(jsonMsg.error);
          setTyping(false);
        } else {
          const event = jsonMsg as ChatCompletionChunk;
          if (event.usage) {
            emitter.emit('langdb_usageStats', {
              usage: event.usage,
              threadId: currentThreadId,
              widgetId: props.widgetId,
            });
            appendUsage(event.usage);
          }
          props.onEvent?.(event);

          setMessages((prevMessages) => {
            const lastMessage = prevMessages[prevMessages.length - 1];

            if (lastMessage && lastMessage.type === MessageType.HumanMessage) {
              return [
                ...prevMessages.slice(0, -1),
                { ...lastMessage, thread_id: currentThreadId },
                {
                  id: currentMessageId || uuidv4(),
                  role: 'assistant' as const,
                  content: event.choices.map((choice) => choice.delta.content).join(''),
                  timestamp: Date.now(),
                  model_name: event.model,
                  type: MessageType.AIMessage,
                  content_type: MessageContentType.Text,
                  thread_id: currentThreadId,
                  trace_id: currentTraceId || undefined,
                },
              ];
            }

            const updatedLastMessage: Message = {
              ...lastMessage,
              content:
                lastMessage.content +
                event.choices.map((choice) => choice.delta.content).join(''),
              run_id: currentRunId || undefined,
            };

            if (!updatedLastMessage.metrics && event.usage) {
              const customUsage: any = { ...event.usage };
              if (customUsage.prompt_tokens) {
                customUsage.input_tokens = customUsage.prompt_tokens;
              }
              if (customUsage.completion_tokens) {
                customUsage.output_tokens = customUsage.completion_tokens;
              }
              updatedLastMessage.metrics = [
                {
                  run_id: currentRunId || undefined,
                  trace_id: currentTraceId || undefined,
                  usage: customUsage,
                  cost: event.usage?.cost,
                },
              ];
            }

            return [...prevMessages.slice(0, -1), updatedLastMessage];
          });
        }
      } catch (error) {
        console.error('Error processing event:', error);
      }
    },
    [props, setTyping, setError, appendUsage, setMessages]
  );

  const submitMessageFn = useCallback(
    async (inputProps: {
      inputText: string;
      files: FileWithPreview[];
      searchToolEnabled?: boolean;
      otherTools?: string[];
    }) => {
      abortControllerRef.current = new AbortController();

      const { inputText, files } = inputProps;

      if (inputText.trim() === '') return;

      const newMessage: Message = {
        id: uuidv4(),
        role: 'user',
        content: inputText,
        timestamp: Date.now(),
        type: MessageType.HumanMessage,
        content_type: MessageContentType.Text,
        thread_id: threadId,
        files,
      };

      setMessages((prevMessages) => {
        return [...prevMessages, newMessage];
      });
      setCurrentInput('');
      setTyping(true);
      setError(undefined);
      scrollToBottom();
      let currentThreadId = threadId;
      const widgetId = props.widgetId;

      try {
        widgetId &&
          emitter.emit('langdb_chatWindow', {
            widgetId,
            state: 'SubmitStart',
            threadId: currentThreadId,
            messageId: messageId,
          });

        let currentMessageId = messageId;
        let currentTraceId = traceId;
        let currentRunId: string | undefined = undefined;
        let isFirstSignal = true;

        // Stream chat completion
        const chatUrl = getChatCompletionsUrl();
        const response = await fetch(chatUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(props.apiKey && { Authorization: `Bearer ${props.apiKey}` }),
            ...(props.projectId && { 'X-Project-Id': props.projectId }),
          },
          body: JSON.stringify({
            model: props.modelName,
            messages: [
              ...messages.map((msg) => ({
                role: msg.role,
                content: msg.content,
              })),
              { role: 'user', content: inputText },
            ],
            stream: true,
            ...(threadId && { thread_id: threadId }),
          }),
          signal: abortControllerRef.current?.signal,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || response.statusText);
        }

        // Extract headers
        const threadIdHeader = response.headers.get('X-Thread-Id');
        const messageIdHeader = response.headers.get('X-Message-Id');
        const traceIdHeader = response.headers.get('X-Trace-Id');
        const runIdHeader = response.headers.get('X-Run-Id');
        currentThreadId = threadIdHeader || currentThreadId;
        currentMessageId = messageIdHeader || currentMessageId;
        currentTraceId = traceIdHeader || currentTraceId;
        currentRunId = runIdHeader || currentRunId;
        setThreadId(currentThreadId);
        setMessageId(currentMessageId);
        setTraceId(currentTraceId);

        widgetId &&
          emitter.emit('langdb_chatWindow', {
            widgetId,
            state: 'Processing',
            threadId: currentThreadId,
            messageId: currentMessageId,
            traceId: currentTraceId,
          });

        // Read stream
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                widgetId &&
                  emitter.emit('langdb_chatWindow', {
                    widgetId,
                    state: 'Processing',
                    threadId: currentThreadId,
                    messageId: currentMessageId,
                    traceId: currentTraceId,
                    runId: currentRunId,
                  });

                handleMessage(
                  data,
                  currentThreadId || threadId,
                  currentMessageId || messageId,
                  currentTraceId,
                  currentRunId
                );

                if (isFirstSignal) {
                  setTimeout(() => {
                    scrollToBottom();
                  });
                }
                isFirstSignal = false;
              }
            }
          }
        }

        widgetId &&
          emitter.emit('langdb_chatWindow', {
            widgetId,
            state: 'SubmitEnd',
            threadId: currentThreadId,
            messageId: currentMessageId,
            traceId: currentTraceId,
            runId: currentRunId,
          });

        setMessageId(undefined);
        setTyping(false);
      } catch (error) {
        widgetId &&
          emitter.emit('langdb_chatWindow', {
            widgetId,
            state: 'SubmitError',
            error: error instanceof Error ? error.message : String(error),
            threadId: currentThreadId,
            messageId: messageId,
            traceId: traceId,
          });

        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }

        setError(error instanceof Error ? error.message : String(error));
        setTyping(false);
      } finally {
        abortControllerRef.current = null;
        widgetId &&
          emitter.emit('langdb_chatWindow', {
            widgetId,
            state: 'SubmitEnd',
            threadId: currentThreadId,
            messageId: messageId,
            traceId: traceId,
          });
      }
    },
    [
      threadId,
      setMessages,
      setCurrentInput,
      setTyping,
      setError,
      scrollToBottom,
      props,
      messageId,
      traceId,
      messages,
      setThreadId,
      setMessageId,
      setTraceId,
      handleMessage,
    ]
  );

  const terminateChat = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setTyping(false);
    setMessageId(undefined);
  }, [setTyping, setMessageId]);

  return {
    submitMessageFn,
    messagesEndRef,
    scrollToBottom,
    terminateChat,
  };
};

function tryParseJson(data: string) {
  try {
    return JSON.parse(data);
  } catch (error) {
    return undefined;
  }
}