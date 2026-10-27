"use client";

/**
 * Compact mic control for every Jarvis Ask composer (docked launcher, Lead
 * Proposals entry, estimate Handy rail, /jarvis). Matches Handoff Ask Handy's
 * icon mic — speech fills the textarea; the user taps Send (no giant CTA).
 *
 * Chrome/Edge/Safari ship `webkitSpeechRecognition`. Firefox has no Web Speech
 * API — we still render a disabled mic with a title so the toolbar layout
 * stays consistent instead of vanishing (same progressive-enhancement idea as
 * field geolocation).
 */

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

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

function MicIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3.5a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0v-5a3 3 0 0 0-3-3Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path
        d="M7.5 11.5a4.5 4.5 0 0 0 9 0M12 16v3.5M9.5 19.5h5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function JarvisVoiceButton({
  onTranscript,
  onFinish,
  disabled = false,
}: {
  /** Called with each finalized chunk of speech — the caller appends into the composer. */
  onTranscript: (text: string) => void;
  /**
   * Optional. When set, called once listening stops if any speech was captured.
   * Handoff-style composers leave this unset so dictation only fills the input
   * and Send submits. Pass it only for a deliberate auto-send flow.
   */
  onFinish?: () => void;
  disabled?: boolean;
}) {
  const supported = useSyncExternalStore(
    () => () => {},
    () => getSpeechRecognitionConstructor() !== undefined,
    () => false,
  );
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const capturedAnythingRef = useRef(false);

  useEffect(() => {
    return () => recognitionRef.current?.stop();
  }, []);

  function toggleListening() {
    if (!supported || disabled) return;

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const RecognitionCtor = getSpeechRecognitionConstructor();
    if (!RecognitionCtor) return;

    capturedAnythingRef.current = false;
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
      if (finalChunk.trim()) {
        capturedAnythingRef.current = true;
        onTranscript(finalChunk.trim());
      }
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => {
      setListening(false);
      if (capturedAnythingRef.current) onFinish?.();
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }

  const title = !supported
    ? "Voice input isn’t supported in this browser"
    : listening
      ? "Stop listening"
      : "Speak to Jarvis";

  return (
    <button
      type="button"
      onClick={toggleListening}
      disabled={disabled || !supported}
      aria-pressed={listening}
      aria-label={title}
      title={title}
      className={`inline-flex h-10 w-10 shrink-0 touch-manipulation items-center justify-center rounded-full transition sm:h-9 sm:w-9 ${
        listening
          ? "animate-pulse text-[var(--bt-on-primary)]"
          : "text-[var(--bt-muted)] hover:bg-[color-mix(in_srgb,var(--bt-text)_5%,transparent)] hover:text-[var(--bt-text)] disabled:cursor-not-allowed disabled:opacity-40"
      }`}
      style={listening ? { background: "var(--bt-primary)" } : undefined}
    >
      <MicIcon />
    </button>
  );
}
