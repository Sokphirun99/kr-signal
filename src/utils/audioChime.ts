/**
 * KR-Signal Web Audio API chime synthesizer and sound preferences.
 */

const STORAGE_KEY = "kr_signal_audio_enabled";
const DEFAULT_FREQUENCY_HZ = 587.33; // D5 note
const HARMONIC_FREQUENCY_HZ = 880.0; // A5 note
const CHIME_VOLUME = 0.12;
const CHIME_DURATION_SEC = 0.45;

let cachedContext: AudioContext | null = null;

function getOrCreateAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!cachedContext) {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      cachedContext = new AudioCtx();
    }
  }
  if (cachedContext && cachedContext.state === "suspended") {
    cachedContext.resume().catch(() => {});
  }
  return cachedContext;
}

/**
 * Checks whether audio alerts are currently enabled in localStorage.
 * Inputs: none.
 * Outputs: boolean.
 * Side effects: reads localStorage.
 * Failure modes: returns false on storage read failure.
 */
export function isAudioAlertsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

/**
 * Updates the audio alerts preference in localStorage.
 * Inputs: isEnabled - boolean flag.
 * Outputs: void.
 * Side effects: writes to localStorage.
 * Failure modes: handles storage errors gracefully.
 */
export function setAudioAlertsEnabled(isEnabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, isEnabled ? "true" : "false");
  } catch {
    // Storage access restricted or full
  }
}

/**
 * Toggles audio alerts preference and returns the new state.
 * Inputs: none.
 * Outputs: updated boolean state.
 * Side effects: writes to localStorage.
 * Failure modes: returns current state on error.
 */
export function toggleAudioAlerts(): boolean {
  const nextState = !isAudioAlertsEnabled();
  setAudioAlertsEnabled(nextState);
  return nextState;
}

/**
 * Plays a synthetic dual-tone bell chime using Web Audio API.
 * Inputs: soundType - "new_signal" | "take_profit" | "stop_loss".
 * Outputs: void.
 * Side effects: plays audio through system speakers if enabled.
 * Failure modes: fails silently if audio context is blocked.
 */
export function playSignalChime(soundType: "new_signal" | "take_profit" | "stop_loss" = "new_signal"): void {
  if (!isAudioAlertsEnabled()) return;
  const ctx = getOrCreateAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const gain = ctx.createGain();

  const baseFreq = soundType === "take_profit" ? 659.25 : soundType === "stop_loss" ? 440.0 : DEFAULT_FREQUENCY_HZ;
  const harmFreq = soundType === "take_profit" ? 987.77 : soundType === "stop_loss" ? 349.23 : HARMONIC_FREQUENCY_HZ;

  osc1.type = "sine";
  osc1.frequency.setValueAtTime(baseFreq, now);

  osc2.type = "sine";
  osc2.frequency.setValueAtTime(harmFreq, now);

  gain.gain.setValueAtTime(CHIME_VOLUME, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + CHIME_DURATION_SEC);

  osc1.connect(gain);
  osc2.connect(gain);
  gain.connect(ctx.destination);

  osc1.start(now);
  osc2.start(now);
  osc1.stop(now + CHIME_DURATION_SEC);
  osc2.stop(now + CHIME_DURATION_SEC);
}
