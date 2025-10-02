import React, { useState, useRef, KeyboardEvent, useCallback, useEffect } from 'react';
import { Send, Paperclip, X, Mic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDropzone } from 'react-dropzone';
import { FileWithPreview } from '@/types/chat';
import { emitter } from '@/utils/eventEmitter';

interface ChatInputProps {
  onSubmit: (props: {
    inputText: string;
    files: FileWithPreview[];
    searchToolEnabled?: boolean;
    otherTools?: string[];
  }) => Promise<void>;
  currentInput: string;
  setCurrentInput: (input: string) => void;
  disabled?: boolean;
  placeholder?: string;
  searchToolEnabled?: boolean;
  toggleSearchTool?: (enabled: boolean) => void;
}

const convertFileToBase64 = (file: File) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
  });
};

export const ChatInput: React.FC<ChatInputProps> = ({
  onSubmit,
  currentInput,
  setCurrentInput,
  disabled = false,
  searchToolEnabled,
}) => {
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState('');
  const [isSupportingSpeechRecognition, setIsSupportingSpeechRecognition] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Check if the browser supports SpeechRecognition
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      setIsSupportingSpeechRecognition(false);
    } else {
      setIsSupportingSpeechRecognition(true);
    }
  }, []);

  useEffect(() => {
    const handleFileAdded = ({ files: newFiles }: { files: FileWithPreview[] }) => {
      setFiles((prevFiles) => [...prevFiles, ...newFiles]);
    };
    emitter.on('langdb_input_fileAdded', handleFileAdded);
    emitter.on('langdb_input_speechRecognitionStart', () => {
      setIsListening(true);
      setError('');
    });
    emitter.on('langdb_input_speechRecognitionEnd', () => {
      setIsListening(false);
    });
    return () => {
      emitter.off('langdb_input_fileAdded', handleFileAdded);
      emitter.off('langdb_input_speechRecognitionStart', () => {
        setIsListening(true);
        setError('');
      });
      emitter.off('langdb_input_speechRecognitionEnd', () => {
        setIsListening(false);
      });
    };
  }, []);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const updatedFilesPromises = acceptedFiles.map(async (file) => {
      if (file.type.startsWith('audio/')) {
        const base64 = await convertFileToBase64(file);
        return {
          preview: '',
          base64: base64 as string,
          raw_file: file,
          ...file,
          type: file.type,
        } as FileWithPreview;
      }
      if (file.type.startsWith('image/')) {
        const base64 = await convertFileToBase64(file);
        return {
          preview: URL.createObjectURL(file),
          base64: base64 as string,
          raw_file: file,
          ...file,
          type: file.type,
        } as FileWithPreview;
      }
      return {
        preview: URL.createObjectURL(file),
        raw_file: file,
        ...file,
        type: file.type,
      } as FileWithPreview;
    });
    const updatedFiles = await Promise.all(updatedFilesPromises);
    emitter.emit('langdb_input_fileAdded', { files: updatedFiles });
  }, []);

  const { getRootProps, isDragActive, open, getInputProps } = useDropzone({
    onDrop,
    noClick: true,
    noKeyboard: true,
    accept: {
      'image/*': [],
      'audio/*': [],
    },
  });

  const startListening = useCallback(() => {
    if (typeof window === 'undefined') {
      setError('Speech recognition is not available on server.');
      return;
    }

    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      setError('Speech recognition is not supported in this browser.');
      return;
    }

    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognitionAPI();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onstart = () => {
      emitter.emit('langdb_input_speechRecognitionStart', {});
    };

    recognition.onresult = (event: any) => {
      const speechResult = event.results[0][0].transcript;
      onSubmit({
        inputText: speechResult,
        files,
        searchToolEnabled,
        otherTools: [],
      });
    };

    recognition.onerror = (event: any) => {
      setError(event.error);
    };

    recognition.onend = () => {
      emitter.emit('langdb_input_speechRecognitionEnd', {});
    };

    recognition.start();
  }, [files, searchToolEnabled, onSubmit]);

  const handleSend = () => {
    if (currentInput.trim() && !disabled) {
      const currentFiles = files;
      setFiles([]);
      onSubmit({
        inputText: currentInput,
        files: currentFiles,
        searchToolEnabled,
        otherTools: [],
      });
      setCurrentInput('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
    const textarea = e.currentTarget;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="border-t border-border p-4 bg-card">
      {files.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {files.map((file, index) => (
            <div
              key={index}
              className="relative group bg-secondary rounded-lg p-2 flex items-center gap-2 border border-border"
            >
              {file.type.startsWith('image/') && file.preview && (
                <img src={file.preview} alt={file.name} className="w-12 h-12 object-cover rounded" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-foreground truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
              <button
                onClick={() => removeFile(index)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <div className="text-red-500 text-sm mb-2">{error}</div>}
      {isListening && <div className="animate-pulse text-xs mb-2 text-muted-foreground">Listening...</div>}

      <div {...getRootProps()} className="relative">
        {isDragActive && (
          <div className="absolute inset-0 bg-black/50 flex flex-col gap-4 justify-center items-center text-white text-sm z-50 rounded-lg">
            <Paperclip className="h-8 w-8" />
            <div className="flex flex-col justify-center items-center">
              <span className="font-bold">Add anything</span>
              <span>Drop any file here to add it to conversation</span>
            </div>
          </div>
        )}
        <input {...getInputProps()} className="hidden" />

        <div className="bg-secondary rounded-xl border border-input focus-within:border-[rgb(var(--theme-500))] focus-within:shadow-[0_0_0_3px_rgba(var(--theme-rgb),0.1)] transition-all">
          <textarea
            ref={textareaRef}
            value={currentInput}
            onChange={(e) => setCurrentInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            placeholder="Press Enter to send, Shift+Enter for new line"
            disabled={disabled || isListening}
            rows={1}
            className="w-full bg-transparent text-secondary-foreground placeholder-muted-foreground resize-none
              focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed
              max-h-[200px] overflow-y-auto px-4 pt-3 pb-2"
          />
          <div className="flex items-center justify-between gap-2 px-3 pb-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  open();
                }}
                className="flex items-center justify-center h-8 w-8 rounded-md hover:bg-accent transition-colors"
                title="Attach file"
              >
                <Paperclip className="h-4 w-4 text-muted-foreground" />
              </button>
              {isSupportingSpeechRecognition && (
                <button
                  type="button"
                  disabled={isListening || disabled}
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    startListening();
                  }}
                  className="flex items-center justify-center h-8 w-8 rounded-md hover:bg-accent transition-colors disabled:opacity-50"
                  title="Voice input"
                >
                  <Mic className={`h-4 w-4 ${isListening ? 'text-red-500 animate-pulse' : 'text-muted-foreground'}`} />
                </button>
              )}
            </div>
            <Button
              onClick={handleSend}
              disabled={disabled || !currentInput.trim()}
              size="icon"
              className="bg-[rgb(var(--theme-600))] hover:bg-[rgb(var(--theme-700))] text-white dark:bg-[rgb(var(--theme-600))] dark:hover:bg-[rgb(var(--theme-700))] h-8 w-8 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg"
              title="Send message"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};