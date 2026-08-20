"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Web Speech API wrapper.
 *
 * Recognition ships in Chrome and Edge; Safari and Firefox do not have it. The
 * hook reports `supported: false` there rather than throwing, and the panel
 * falls back to the same engine driven by typing — so no browser loses the
 * feature, only the microphone.
 */

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<
    ArrayLike<{ transcript: string }> & { isFinal: boolean }
  >;
};

type SpeechWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

export type SpeechError = "denied" | "no-speech" | "unavailable" | null;

export function useSpeech({
  onFinal,
}: {
  onFinal: (transcript: string) => void;
}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<SpeechError>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // Kept in a ref so the recognition instance, which is created once, always
  // calls the newest callback without being torn down and rebuilt. Written in
  // an effect rather than during render — a render can be discarded, and a
  // discarded render must not leave a mutation behind.
  const onFinalRef = useRef(onFinal);
  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);

  useEffect(() => {
    const w = window as SpeechWindow;
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) {
      // Already false; nothing to set.
      return;
    }

    // Feature detection can only run on the client, so the server necessarily
    // renders the unsupported state and this promotes it after mount. That is
    // the intended single extra render, not a cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(true);
    const recognition = new Ctor();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setListening(true);
      setError(null);
      setInterim("");
    };

    recognition.onresult = (event) => {
      let live = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0]?.transcript ?? "";
        if (result.isFinal) {
          const finalText = text.trim();
          setInterim("");
          if (finalText) onFinalRef.current(finalText);
        } else {
          live += text;
        }
      }
      if (live) setInterim(live);
    };

    recognition.onerror = (event) => {
      setListening(false);
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("denied");
      } else if (event.error === "no-speech") {
        setError("no-speech");
      } else if (event.error !== "aborted") {
        setError("unavailable");
      }
    };

    recognition.onend = () => {
      setListening(false);
      setInterim("");
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.onstart = null;
      recognition.abort();
      recognitionRef.current = null;
    };
  }, []);

  const start = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    try {
      recognition.start();
    } catch {
      // start() throws if it is already running; that is the state we wanted.
    }
  }, []);

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  return { supported, listening, interim, error, start, stop };
}

/**
 * Speaks Delia's reply. Silently does nothing where synthesis is missing, and
 * respects the visitor's reduced-motion preference as a proxy for "keep this
 * page quiet" — the reply is always on screen as text regardless.
 */
export function speak(text: string): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 1.02;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  } catch {
    // Synthesis is a nicety; the panel already shows the same text.
  }
}

export function stopSpeaking(): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // Nothing to cancel.
  }
}
