"use client";

// Spoken cues (browser speech synthesis) and hands-free voice commands (Web Speech API where
// available). Both degrade gracefully: if a capability is missing the app stays fully visual.

export class Speaker {
  private voice: SpeechSynthesisVoice | null = null;
  private speakingListeners = new Set<(speaking: boolean) => void>();
  private last = "";
  muted = false;

  constructor() {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const pick = () => {
      const voices = window.speechSynthesis.getVoices();
      this.voice =
        voices.find((v) => /en[-_]/i.test(v.lang) && /(Samantha|Ava|Natural|Google US English|Siri)/i.test(v.name)) ??
        voices.find((v) => /en[-_]/i.test(v.lang)) ??
        null;
    };
    pick();
    window.speechSynthesis.addEventListener?.("voiceschanged", pick);
  }

  get supported(): boolean {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  get speaking(): boolean {
    return this.supported && window.speechSynthesis.speaking;
  }

  get lastSpoken(): string {
    return this.last;
  }

  onSpeakingChange(fn: (speaking: boolean) => void): () => void {
    this.speakingListeners.add(fn);
    return () => this.speakingListeners.delete(fn);
  }

  speak(text: string, opts: { interrupt?: boolean; rate?: number } = {}): void {
    if (!this.supported || this.muted || !text) return;
    this.last = text;
    if (opts.interrupt) window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (this.voice) u.voice = this.voice;
    u.rate = opts.rate ?? 1.02;
    u.onstart = () => this.speakingListeners.forEach((l) => l(true));
    u.onend = u.onerror = () => this.speakingListeners.forEach((l) => l(false));
    window.speechSynthesis.speak(u);
  }

  stop(): void {
    if (this.supported) window.speechSynthesis.cancel();
  }
}

export type VoiceCommand = "start" | "stop" | "analyze_last" | "what_to_fix" | "repeat" | "mute" | "unmute" | "pause" | "resume";

const COMMANDS: [RegExp, VoiceCommand][] = [
  [/\b(start|begin)( the)? (session|recording|training)\b/, "start"],
  [/\b(stop|end|finish)( the)? (session|recording|training)?\b/, "stop"],
  [/\banaly[sz]e (my )?(last|latest) (stroke|swing|shot)\b/, "analyze_last"],
  [/\bwhat should i (fix|work on|change)\b/, "what_to_fix"],
  [/\b(repeat|say) (that|again)\b/, "repeat"],
  [/\b(mute|quiet|silence)( the)?( coach)?\b/, "mute"],
  [/\bunmute\b|\bturn (the )?(coach|voice) (back )?on\b/, "unmute"],
  [/\bpause\b/, "pause"],
  [/\bresume\b|\bcontinue\b/, "resume"],
];

export function parseCommand(transcript: string): VoiceCommand | null {
  const t = transcript.toLowerCase().trim();
  for (const [re, cmd] of COMMANDS) if (re.test(t)) return cmd;
  return null;
}

interface RecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

export function speechRecognitionSupported(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as Record<string, unknown>;
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

/**
 * Listens continuously for short voice commands. Requires microphone permission, which the
 * browser asks for separately from the camera. Returns a stop function.
 */
export function listenForCommands(
  onCommand: (c: VoiceCommand, transcript: string) => void,
  onError: (message: string) => void,
): () => void {
  const w = window as unknown as Record<string, new () => RecognitionLike>;
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) {
    onError("Voice commands aren't supported in this browser. Use the on-screen controls instead.");
    return () => {};
  }
  let stopped = false;
  const rec = new Ctor();
  rec.continuous = true;
  rec.interimResults = false;
  rec.lang = "en-US";
  rec.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (!r.isFinal) continue;
      const text = r[0]?.transcript ?? "";
      const cmd = parseCommand(text);
      if (cmd) onCommand(cmd, text);
    }
  };
  rec.onerror = (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") {
      stopped = true;
      onError("Microphone permission was denied, so voice commands are off.");
    } else if (e.error !== "no-speech" && e.error !== "aborted") {
      onError(`Voice commands paused (${e.error}).`);
    }
  };
  // Browsers end recognition periodically; restart while active.
  rec.onend = () => {
    if (!stopped) {
      try {
        rec.start();
      } catch {
        /* already started */
      }
    }
  };
  try {
    rec.start();
  } catch {
    onError("Could not start voice commands.");
  }
  return () => {
    stopped = true;
    rec.stop();
  };
}
