/**
 * useVoiceInput
 *
 * Shared hook for Web Speech API voice-to-text input.
 * Used by ObjectiveInputTab and ApiInitializeTab.
 */

import { useState, useCallback, useRef, useEffect } from "react";

interface UseVoiceInputOptions {
  /** Called with final transcript text to append */
  onTranscript: (text: string) => void;
}

export function useVoiceInput({ onTranscript }: UseVoiceInputOptions) {
  const [isListening, setIsListening] = useState(false);
  const [isSpeechSupported, setIsSpeechSupported] = useState(false);
  const recognitionRef = useRef<ReturnType<typeof Object> | null>(null);

  // Check speech recognition support on mount
  useEffect(() => {
    setIsSpeechSupported(
      typeof window !== "undefined" &&
        ("SpeechRecognition" in window || "webkitSpeechRecognition" in window)
    );
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        (recognitionRef.current as { stop: () => void }).stop();
      }
    };
  }, []);

  const toggleVoiceInput = useCallback(() => {
    if (isListening) {
      if (recognitionRef.current) {
        (recognitionRef.current as { stop: () => void }).stop();
        recognitionRef.current = null;
      }
      setIsListening(false);
      return;
    }

    if (
      !("webkitSpeechRecognition" in window || "SpeechRecognition" in window)
    )
      return;

    const SpeechRecognitionAPI =
      (window as /* eslint-disable-line @typescript-eslint/no-explicit-any */ any)
        .SpeechRecognition ||
      (window as /* eslint-disable-line @typescript-eslint/no-explicit-any */ any)
        .webkitSpeechRecognition;
    const recognition = new SpeechRecognitionAPI();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.continuous = true;

    recognition.onresult = (event: {
      resultIndex: number;
      results: {
        length: number;
        [key: number]: { isFinal: boolean; 0: { transcript: string } };
      };
    }) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          transcript += event.results[i][0].transcript;
        }
      }
      if (transcript) {
        onTranscript(transcript.trim());
      }
    };

    recognition.onerror = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening, onTranscript]);

  return { isListening, isSpeechSupported, toggleVoiceInput };
}
