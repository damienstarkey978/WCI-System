"use client";

/**
 * "Let's get to work" — a mic button on every Jarvis composer (the docked launcher
 * panel, the dashboard's inline business-advisor chat, /jarvis and /jarvis/[id], and
 * any other inline embedding, since they all render through JarvisChatPanel.tsx)
 * that dictates straight into the message box via the browser's built-in speech
 * recognition, so the device's microphone does the typing instead of a keyboard.
 *
 * Chrome, Edge, and Safari (desktop and mobile) all ship `webkitSpeechRecognition`;
 * Firefox doesn't implement the Web Speech API at all, so this renders nothing there
 * rather than a button that errors on click — same progressive-enhancement approach
 * as the geolocation check in field/time-clock/time-clock-client.tsx.
 */

import { useEffect, useRef, useState } from "react";

interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly 0: { readonly transcript: string };
}

interface SpeechRecognitionEventLike extends Event {
  readonly resultIndex: number;
  readonly results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function getSpeechRecognitionConstructor(): SpeechRecognitionConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  const globalWithSpeech = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return globalWithSpeech.SpeechRecognition ?? globalWithSpeech.webkitSpeechRecognition;
}

export function JarvisVoiceButton({
  onTranscript,
  funUi,
}: {
  /** Called with each finalized chunk of speech — the caller decides how to fold it
   *  into the composer (JarvisChatPanel.tsx appends it to whatever's already typed,
   *  so starting to dictate never clobbers a draft). */
  onTranscript: (text: string) => void;
  funUi: boolean;
}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    const detectSupport = () => setSupported(getSpeechRecognitionConstructor() !== undefined);
    detectSupport();
    return () => recognitionRef.current?.stop();
  }, []);

  function toggleListening() {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const RecognitionCtor = getSpeechRecognitionConstructor();
    if (!RecognitionCtor) return;

    const recognition = new RecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      let finalChunk = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        if (result.isFinal) finalChunk += `${result[0].transcript} `;
      }
      if (finalChunk.trim()) onTranscript(finalChunk.trim());
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  }

  if (!supported) return null;

  return (
    <button
      type="button"
      onClick={toggleListening}
      aria-pressed={listening}
      className={`flex w-full items-center justify-center gap-2 rounded-full py-2 text-sm font-semibold text-white transition ${
        funUi ? "wci-fun-chunky-btn wci-fun-heading" : ""
      } ${listening ? "animate-pulse" : ""}`}
      style={{ background: funUi ? "linear-gradient(135deg, var(--bt-primary), var(--bt-nav))" : "var(--bt-primary)" }}
    >
      <span aria-hidden="true">🎤</span>
      {listening ? "Listening…" : "Let's get to work"}
    </button>
  );
}
