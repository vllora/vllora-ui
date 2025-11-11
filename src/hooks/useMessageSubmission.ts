import { useCallback, useRef } from 'react';
import { Message, FileWithPreview, ChatCompletionChunk } from '@/types/chat';
import { useScrollToBottom } from './useScrollToBottom';
import { emitter } from '@/utils/eventEmitter';
import { getChatCompletionsUrl } from '@/config/api';
import { McpServerConfig } from '@/services/mcp-api';
import { getTokenProvider } from '@/lib/api-client';

interface MessageSubmissionProps {
  apiKey?: string;
  projectId?: string;
  modelName?: string;
  onEvent?: (event: ChatCompletionChunk) => void;
  widgetId?: string;
  threadId?: string;
  threadTitle?: string;
  setCurrentInput: React.Dispatch<React.SetStateAction<string>>;
  setTyping: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string | undefined>>;
  setTraceId: React.Dispatch<React.SetStateAction<string | undefined>>;
  appendUsage: (usage: any) => void;
  traceId?: string;
}

export const useMessageSubmission = (props: MessageSubmissionProps) => {
  const abortControllerRef = useRef<AbortController | null>(null);
  const {
    setCurrentInput,
    setTyping,
    setError,
    setTraceId,
    appendUsage,
    traceId,
  } = props;

  const { messagesEndRef, scrollToBottom } = useScrollToBottom();

  const handleMessage = useCallback(
    (
      data: string,
      currentThreadId?: string,
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
            emitter.emit('vllora_usageStats', {
              usage: event.usage,
              threadId: currentThreadId,
              widgetId: props.widgetId,
            });
            //appendUsage(event.usage);
          }
          props.onEvent?.(event);
        }
      } catch (error) {
        console.error('Error processing event:', error);
      }
    },
    [props, setTyping, setError, appendUsage]
  );

  const submitMessageFn = useCallback(
    async (inputProps: {
      inputText: string;
      files: FileWithPreview[];
      searchToolEnabled?: boolean;
      otherTools?: string[];
      threadId?: string;
      threadTitle?: string;
      initialMessages?: Message[];
      toolsUsage?: Map<string, McpServerConfig>;
      othersParams?: any;
    }) => {
      abortControllerRef.current = new AbortController();

      const { inputText, files, threadId, threadTitle, initialMessages, toolsUsage, othersParams } = inputProps;      
      if (inputText.trim() === '') return;

      // const newMessage: Message = {
      //   id: uuidv4(),
      //   type: MessageType.HumanMessage,
      //   content: inputText,
      //   timestamp: Date.now(),
      //   content_type: MessageContentType.Text,
      //   thread_id: threadId,
      //   files,
      //   is_from_local: true,
      // };

      // setMessages((prevMessages) => {
      //   return [...prevMessages, newMessage];
      // });
      setCurrentInput('');
      setTyping(true);
      setError(undefined);
      scrollToBottom();
      let currentThreadId = threadId;
      const widgetId = props.widgetId;

      try {
        widgetId &&
          emitter.emit('vllora_chatWindow', {
            widgetId,
            state: 'SubmitStart',
            threadId: currentThreadId,
          });

        let currentTraceId = traceId;
        let currentRunId: string | undefined = undefined;
        let isFirstSignal = true;

        // Stream chat completion
        const chatUrl = getChatCompletionsUrl();

        // Build the current message content with files
        const buildMessageContent = (text: string, files: FileWithPreview[]) => {
          if (!files || files.length === 0) {
            return text;
          }

          const content: any[] = [];

          files.forEach((file) => {
            if (file.type.startsWith('image/')) {
              // Use base64 for API, fall back to preview for display only
              const imageUrl = file.base64;
              if (imageUrl) {
                content.push({
                  type: 'image_url',
                  image_url: { url: imageUrl },
                });
              }
            } else if (file.type.startsWith('audio/') && file.base64) {
              // Extract format from file name
              const format = file.name.split('.').pop();
              content.push({
                type: 'input_audio',
                audio: {
                  data: file.base64.split(',')[1], // Remove data:audio/...;base64, prefix
                  format: format || 'mp3',
                },
              });
            }
          });

          // Add text message at the end
          content.push({ type: 'text', text });

          return content;
        };

        let requestBody: any = {
          model: props.modelName,
          messages: [
            ...(initialMessages?.map((msg) => ({
              role: msg.type,
              content: msg.files && msg.files.length > 0
                ? buildMessageContent(msg.content, msg.files)
                : msg.content,
            })) || []),
            {
              role: 'user',
              content: buildMessageContent(inputText, files),
            },
          ],
          stream: true,
          ...(threadId && { thread_id: threadId }),
          ...(othersParams && {...othersParams}),
        };

        if (toolsUsage && toolsUsage.size > 0) {
          
          // Convert Map to array - each server config becomes one entry
          const mcpServers: any[] = [];
          for (const [serverName, config] of toolsUsage.entries()) {
            mcpServers.push({
              ...config.definition,
              filter: config.selectedTools.map((tool) => ({ name: tool })),
            });
          }
          
          requestBody.mcp_servers = mcpServers;
        }
        

        const sanitizedThreadTitle = threadTitle?.replace(/[^\w\s-]/g, '');
        let bearerToken: string | null = null;
        if (!props.apiKey ) {
           let getTokenProviderFn = getTokenProvider();
           if(getTokenProviderFn) {
            bearerToken = await getTokenProviderFn();
           }
        }
        const response = await fetch(chatUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(props.apiKey && { Authorization: `Bearer ${props.apiKey}` }),
            ...(props.projectId && { 'X-Project-Id': props.projectId }),
            ...(threadId && { 'X-Thread-Id': threadId }),
            ...(sanitizedThreadTitle && { 'X-Thread-Title': sanitizedThreadTitle }),
            ...(bearerToken && !props.apiKey && { Authorization: `Bearer ${bearerToken}` }),
          },
          body: JSON.stringify(requestBody),
          signal: abortControllerRef.current?.signal,
        });

        if (!response.ok) {
          const errorData = await response.json();
          if(errorData.error && typeof errorData.error === 'object' && errorData.error.message) {
            throw new Error(errorData.error.message);
          } else {
            throw new Error(errorData.error || response.statusText);
          }
        }

        // Extract headers
        const threadIdHeader = response.headers.get('X-Thread-Id');
        const traceIdHeader = response.headers.get('X-Trace-Id');
        const runIdHeader = response.headers.get('X-Run-Id');
        currentThreadId = threadIdHeader || currentThreadId;
        currentTraceId = traceIdHeader || currentTraceId;
        currentRunId = runIdHeader || currentRunId;
        // setMessageId(currentMessageId);
        // setTraceId(currentTraceId);

        widgetId &&
          emitter.emit('vllora_chatWindow', {
            widgetId,
            state: 'Processing',
            threadId: currentThreadId,
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
                  emitter.emit('vllora_chatWindow', {
                    widgetId,
                    state: 'Processing',
                    threadId: currentThreadId,
                    traceId: currentTraceId,
                    runId: currentRunId,
                  });

                handleMessage(
                  data,
                  currentThreadId || threadId,
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
          emitter.emit('vllora_chatWindow', {
            widgetId,
            state: 'SubmitEnd',
            threadId: currentThreadId,
            traceId: currentTraceId,
            runId: currentRunId,
          });

        setTyping(false);
      } catch (error) {
        widgetId &&
          emitter.emit('vllora_chatWindow', {
            widgetId,
            state: 'SubmitError',
            error: error instanceof Error ? error.message : String(error),
            threadId: currentThreadId,
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
          emitter.emit('vllora_chatWindow', {
            widgetId,
            state: 'SubmitEnd',
            threadId: currentThreadId,
            traceId: traceId,
          });
          setTimeout(() => {
            scrollToBottom();
          }, 0);
      }
    },
    [
      setCurrentInput,
      setTyping,
      setError,
      scrollToBottom,
      props,
      traceId,
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
  }, [setTyping]);

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